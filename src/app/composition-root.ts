import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CreatureRenderBuffer,
  RenderBuffer,
  SimulationLoop,
  SystemScheduler,
  Transform,
  writeRenderBuffer,
} from '@engine';
import { createUtilityBrain } from '@ai';
import {
  AmbientResource,
  ambientSystem,
  createWorld,
  Item,
  itemSystem,
  plantGrowthSystem,
  plantSpreadSystem,
  Plant,
  SceneryResource,
  TerrainResource,
  isWaterAt,
  WATER,
  PropsResource,
  propSystem,
  sceneryGrowthSystem,
  swayPropsNear,
  WeatherResource,
  weatherSystem,
  DayNightResource,
  dayNightSystem,
  Item as ItemComponent,
  ballSystem,
} from '@world';
import { Creature, Emotions, Mind } from '@creatures';
import { TOOL, WORD, WORD_TEXT } from '@core';
import {
  actionSystem,
  BrainResource,
  callAttention,
  creatureIndexSystem,
  decisionSystem,
  emotionSystem,
  foodIndexSystem,
  grabItem,
  handReactionSystem,
  fearLearningSystem,
  metabolismSystem,
  moveHeldItem,
  moveCarried,
  liftCreature,
  dropCreature,
  carrySystem,
  movementSystem,
  observeCreature,
  offerItem,
  petCreature,
  PlayerResource,
  readCreatureSnapshot,
  releaseItem,
  rememberPetting,
  reproductionSystem,
  roughGesture,
  attractBirds,
  dropScenery,
  plantSeed,
  searchSystem,
  idleSystem,
  rewardSystem,
  confinementSystem,
  planSystem,
  socialSystem,
  DeathsResource,
  orderSystem,
  issueOrder,
  ORDER,
  buddingSystem,
  SpeciesResource,
  PHASE,
  ChronicleResource,
  createChronicle,
  WatchedResource,
  createWatched,
  chronicle,
  recentEntries,
  DiscoveryResource,
  pokeProps,
  rememberPleasantPlace,
  setHandPresence,
  shakeTree,
  spawnCreatures,
  touchWater,
  turnRock,
  writeCreatureBuffer,
  writeItemBuffer,
  teachingSystem,
  showAndTell,
  SpeechResource,
  eggSystem,
  warmEgg,
  hatchNow,
  isEgg,
  forEachEgg,
  shakeFruitFrom,
  feedCreature,
  placeBall,
  placeGift,
  placeEgg,
  scrub,
  nameThing,
  wordForSpot,
} from '@simulation';
import { createRenderer, type FeedbackKind, type Renderer } from '@rendering';
import { AmbientVoice, ambientKindFor } from './ambientSignals';
import { createMusic } from '@audio';
import { App } from '@ui';
import { cardAnchor } from '@ui/cardAnchor';
import { useUiStore } from '@ui/store/simulationStore';

export interface AppInstance {
  dispose(): void;
}

const WORLD_CONFIG = { width: 900, height: 900 } as const;
const WORLD_SEED = 1337;
/**
 * UMA. O mundo começa com a primeira criatura da espécie — sem sexo, sem par e
 * sem história. Se ela morrer antes de brotar, a espécie acaba ali.
 */
const INITIAL_CREATURES = 1;
/** População a partir da qual a espécie ganha machos e fêmeas. */
const SEXUAL_THRESHOLD = 30;
const FIXED_DT = 1 / 20;
const PLANT_CAPACITY = 512;
const ITEM_CAPACITY = 256;
const CREATURE_CAPACITY = 128;
const STATS_INTERVAL_FRAMES = 10;
/** Segundos que a tela fica acesa quando o jogador cutuca a máquina. */
const COMPUTER_FLASH = 4;

export function createApp(rootElement: HTMLElement): AppInstance {
  const world = createWorld(WORLD_CONFIG, WORLD_SEED);
  // Sem sexo: a espécie começa assexuada e só ganha machos e fêmeas quando
  // a população cruzar o limiar.
  // E começa DENTRO DE UM OVO. A primeira coisa que o jogador vê não é uma
  // criatura andando: é uma casca parada no chão, com alguém lá dentro.
  spawnCreatures(world, INITIAL_CREATURES, { sex: 'none', ageFraction: 0.05, asEgg: true });
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  world.setResource(DeathsResource, []);
  world.setResource(SpeechResource, []);
  world.setResource(ChronicleResource, createChronicle());
  world.setResource(WatchedResource, createWatched());
  world.setResource(SpeciesResource, {
    phase: PHASE.budding,
    threshold: SEXUAL_THRESHOLD,
    buds: 0,
  });
  chronicle(world, 'genesis', 'O jardim ganhou seu primeiro ovo', true);
  const terrain = world.getResource(TerrainResource);
  const scenery = world.getResource(SceneryResource);
  const ambient = world.getResource(AmbientResource);
  const weather = world.getResource(WeatherResource);
  const props = world.getResource(PropsResource);
  const cycle = world.getResource(DayNightResource);

  const scheduler = new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(eggSystem)
    .add(emotionSystem)
    .add(handReactionSystem)
    .add(carrySystem)
    .add(fearLearningSystem)
    .add(socialSystem)
    .add(teachingSystem)
    .add(orderSystem)
    .add(planSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(reproductionSystem)
    .add(buddingSystem)
    .add(metabolismSystem)
    .add(confinementSystem)
    // Julga DEPOIS de agir e metabolizar: a consequência precisa já ter
    // acontecido para ser creditada na intenção que a causou.
    .add(rewardSystem)
    .add(itemSystem)
    .add(ballSystem)
    .add(searchSystem)
    .add(weatherSystem)
    .add(dayNightSystem)
    .add(ambientSystem)
    .add(propSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem)
    .add(sceneryGrowthSystem);

  const plantBuffer = new RenderBuffer(PLANT_CAPACITY);
  const itemBuffer = new RenderBuffer(ITEM_CAPACITY);
  const itemIds = new Int32Array(ITEM_CAPACITY);
  const creatureBuffer = new CreatureRenderBuffer(CREATURE_CAPACITY);

  let activeRenderer: Renderer | null = null;
  let frameCounter = 0;
  let cardTimer = 0;
  const store = useUiStore;
  const CARD_SECONDS = 7;

  /**
   * O QUE ESTÁ NA MÃO.
   *
   * Uma leitura, não um modo: o cinto guarda a ferramenta no estado da
   * interface e o mundo pergunta na hora de agir. É o que faz o mesmo gesto —
   * apertar em cima de um bicho — ser carinho com o coração na mão, banho com a
   * esponja e nada com o ovo.
   */
  const tool = (): number => store.getState().tool;

  /** Aquele objeto é uma fruta que dá para mandar comer? */
  const edible = (entity: number): boolean => {
    const item = world.store(ItemComponent).get(entity);
    return !!item && item.kind === 'fruit' && !item.held && item.carriedBy < 0;
  };

  /**
   * Em qual fruta o jogador clicou.
   *
   * A mira boa vem de fora: quem desenha a fruta sabe onde ela ESTÁ NA TELA e
   * já respondeu isso na hora do clique. A varredura por raio aqui embaixo é só
   * a rede de segurança para o dedo que passou de raspão pela fruta — sozinha
   * ela errava sempre, porque uma fruta é desenhada acima do seu ponto no chão
   * e o clique caía a trinta pixels de mundo do que se via.
   */
  const orderedFruit = (x: number, y: number, clicked: number | null): number => {
    if (clicked !== null && clicked >= 0 && edible(clicked)) return clicked;
    let best = -1;
    let bestDistance = 26;
    const transforms = world.store(Transform);
    world.store(ItemComponent).forEach((item, entity) => {
      if (item.kind !== 'fruit' || item.held || item.carriedBy >= 0) return;
      const spot = transforms.get(entity);
      if (!spot) return;
      const distance = Math.hypot(spot.x - x, spot.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entity;
      }
    });
    return best;
  };

  /**
   * O nome do que está na sua mão.
   *
   * É o vocabulário do ensino direto: mostrar a coisa e dizer a palavra. Um
   * graveto não tem nome no vocabulário — e é bom que não tenha, porque nem
   * tudo no jardim precisa ter: a linguagem cobre o que importa para a vida
   * delas, não o inventário inteiro.
   */
  const wordForItem = (itemId: number): number | null => {
    const item = world.store(ItemComponent).get(itemId);
    if (!item) return null;
    if (item.kind === 'fruit') return WORD.food;
    if (item.kind === 'seed') return WORD.tree;
    if (item.kind === 'stone' || item.kind === 'boulder') return WORD.rock;
    return null;
  };

  /**
   * Você mostrando uma coisa e dizendo o nome dela.
   *
   * Só funciona com a criatura olhando — e é isso que faz ensinar ser uma
   * relação e não um botão. Quem não estava prestando atenção não recebe nada,
   * e o jogador descobre sozinho que precisa chamar antes.
   */
  const nameIt = (itemId: number, creatureId: number): void => {
    const word = wordForItem(itemId);
    if (word === null) return;
    const reply = showAndTell(world, creatureId, word);
    if (reply === 'learned') signal('star', creatureId);
    else if (reply === 'listening') signal('question', creatureId);
  };

  /** Onde uma criatura está, para as ferramentas que miram nela. */
  const creaturePoint = (id: number): [number, number] => {
    const spot = world.store(Transform).get(id);
    return [spot?.x ?? 0, spot?.y ?? 0];
  };

  /**
   * Larga no chão o que a ferramenta atual segura — bola, presente ou ovo.
   *
   * Vive fora dos handlers porque o mesmo gesto chega por dois caminhos: um
   * clique no chão limpo e um clique em cima de uma criatura. Para quem joga é
   * o mesmo movimento, e por isso é o mesmo código.
   */
  const dropAt = (x: number, y: number): boolean => {
    if (tool() === TOOL.ball) {
      activeRenderer?.emit(placeBall(world, x, y) === 'placed' ? 'star' : 'question', x, y - 10);
      return true;
    }
    if (tool() === TOOL.gift) {
      activeRenderer?.emit(placeGift(world, x, y) >= 0 ? 'star' : 'question', x, y - 10);
      return true;
    }
    if (tool() === TOOL.egg) {
      activeRenderer?.emit(placeEgg(world, x, y) === 'placed' ? 'star' : 'question', x, y - 10);
      return true;
    }
    return false;
  };

  /**
   * SINAL VISUAL SOBRE UMA CRIATURA (coração, gota, estrela).
   *
   * Com espaçamento no tempo e no espaço, e os dois por um motivo só: sem
   * eles, um gesto contínuo — a esponja, a mão parada — cuspia seis ícones por
   * segundo no MESMO ponto, e eles subiam empilhados numa coluna reta. O
   * jogador não via "está funcionando": via um carimbo repetido, que é
   * exatamente a cara de um jogo travado.
   *
   * Meio segundo entre dois sinais iguais, e um empurrãozinho lateral
   * sorteado. Um sinal a cada meio segundo lê como resposta; seis por segundo
   * lê como defeito.
   */
  const lastSignal = new Map<string, number>();
  const SIGNAL_GAP = 0.5;
  const signal = (kind: FeedbackKind, id: number): void => {
    const transform = world.store(Transform).get(id);
    if (!transform) return;
    const key = `${kind}:${id}`;
    const now = world.tick * FIXED_DT;
    if (now - (lastSignal.get(key) ?? -Infinity) < SIGNAL_GAP) return;
    lastSignal.set(key, now);
    const drift = (Math.random() - 0.5) * 16;
    activeRenderer?.emit(kind, transform.x + drift, transform.y - 18);
  };

  const clearSelection = (): void => {
    store.getState().setSelectedId(null);
    store.getState().setSelected(null);
  };

  const pushSelected = (): void => {
    const state = store.getState();
    const id = state.selectedId;
    // QUEM O PAINEL OLHA É QUEM O CÉREBRO EXPLICA. A simulação não conhece a
    // interface: ela só sabe que existe uma criatura observada, e é a interface
    // que diz qual. Com o painel fechado não há ninguém, e o cérebro volta a não
    // gastar nada com isso.
    const watched = world.getResource(WatchedResource);
    if (watched) watched.id = state.debug && id !== null ? id : -1;
    if (id === null) return;
    const snapshot = readCreatureSnapshot(world, id);
    if (!snapshot) {
      clearSelection();
      return;
    }
    store.getState().setSelected(snapshot);
    if (state.debug && watched && watched.id === id) {
      store.getState().setThinking({ options: watched.options, tick: watched.tick });
    }
  };

  const step = (dt: number): void => {
    scheduler.update(world, dt);
    world.tick += 1;

    // O que foi dito neste tique vira bolha na tela. A simulação registrou
    // "fulana disse fruta"; quem transforma isso em imagem é esta camada.
    const said = world.getResource(SpeechResource);
    if (said.length > 0) {
      const transforms = world.store(Transform);
      for (const utterance of said) {
        const where = transforms.get(utterance.speaker);
        if (where) activeRenderer?.say(utterance.word, where.x, where.y);
      }
      said.length = 0;
    }
  };

  const render = (alpha: number): void => {
    writeRenderBuffer(world, plantBuffer);
    writeItemBuffer(world, itemBuffer);
    writeCreatureBuffer(world, creatureBuffer);

    // Ids dos itens na mesma ordem do buffer, para o hit-test da mão.
    let index = 0;
    world.store(Item).forEach((_item, entity) => {
      if (index < ITEM_CAPACITY) itemIds[index++] = entity;
    });

    const state = store.getState();
    activeRenderer?.frame({
      plants: plantBuffer,
      items: itemBuffer,
      itemIds,
      creatures: creatureBuffer,
      alpha,
      selectedId: state.selectedId,
      selectedIds: state.selectedIds,
      followId: state.followId,
      ambient,
      rain: weather.intensity,
      puddles: weather.puddles,
      rainbow: weather.rainbow,
      darkness: cycle.darkness,
    });

    // Alguém achou o que estava escondido: uma estrela marca o lugar.
    if (world.hasResource(DiscoveryResource)) {
      const found = world.getResource(DiscoveryResource);
      for (const spot of found) activeRenderer?.emit('star', spot.x, spot.y - 10);
      found.length = 0;
    }

    // O cartão some sozinho depois de alguns segundos.
    if (state.selectedId !== null) {
      cardTimer -= 1 / 60;
      if (cardTimer <= 0) clearSelection();
    }

    frameCounter += 1;
    if (frameCounter >= STATS_INTERVAL_FRAMES) {
      frameCounter = 0;
      store.getState().setStats({
        tick: world.tick,
        population: world.store(Creature).size,
        plants: world.store(Plant).size,
        items: world.store(Item).size,
      });
      pushSelected();
      emitAmbientSignals();
      pushChronicle();
    }
  };

  /**
   * O livro da história chega à tela.
   *
   * O sussurro do canto mostra só o que acabou de acontecer e some sozinho; o
   * livro inteiro fica guardado e só aparece quando o jogador pede (tecla H).
   * A tela é do mundo — a interface só entra quando alguém a chama.
   */
  let lastEntryCount = -1;
  const pushChronicle = (): void => {
    const book = world.getResource(ChronicleResource);
    if (book.entries.length === lastEntryCount) return;
    lastEntryCount = book.entries.length;
    store.getState().setChronicle(recentEntries(world, 3), [...book.entries].reverse());
  };

  /**
   * BALÕES ESPONTÂNEOS — o mundo se explica sem texto, e CALA A BOCA no resto.
   *
   * Isto varre a população em rodízio, uma criatura por chamada, seis chamadas
   * por segundo. Numa população de sessenta, cada bicho tem a vez dele a cada
   * dez segundos e o jardim fica com um balão aqui e outro ali — que é o que se
   * queria.
   *
   * Num jardim de UMA criatura o rodízio degenera: `cursor % 1` é sempre zero,
   * então a mesma criatura é escolhida seis vezes por segundo, para sempre. E o
   * jogo COMEÇA com uma criatura só. Medido no que o jogador viu: um filhote
   * recém-nascido com a atenção acesa ganhava uma interrogação a cada meio
   * segundo — o espaçamento do `signal`, feito para a esponja, que é um gesto
   * contínuo do jogador e deve mesmo responder sempre —, e como cada símbolo
   * vive um segundo e meio, havia três deles no ar o tempo todo, subindo em
   * fila. Não é uma criatura pensando: é um jogo travado.
   *
   * O conserto é o silêncio. Um balão espontâneo é uma coisa que ESCAPA, não uma
   * legenda do que ela está sentindo — e o que diz que ela está viva é o corpo
   * dela fazendo coisas, não um ícone repetido em cima da cabeça. Depois de
   * falar, a criatura fica quieta por uns dez segundos, e o intervalo é
   * sorteado para não bater como metrônomo.
   */
  const voice = new AmbientVoice();
  let ambientCursor = 0;

  const emitAmbientSignals = (): void => {
    const creatures = world.store(Creature);
    if (creatures.size === 0) return;
    let i = 0;
    let picked = -1;
    creatures.forEach((_tag, entity) => {
      if (i++ === ambientCursor % creatures.size) picked = entity;
    });
    ambientCursor += 1;
    if (picked < 0) return;

    const mind = world.store(Mind).get(picked);
    const feel = world.store(Emotions).get(picked);
    if (!mind || !feel) return;

    const kind = ambientKindFor({
      intent: mind.intent,
      affection: mind.affection,
      attention: mind.attention,
      anger: feel.anger,
      happiness: feel.happiness,
    });
    if (!kind) return;
    // O relógio corre no tempo do MUNDO, e não em quadros: acelerado em trinta e
    // dois, o jardim que o jogador está olhando é o mesmo jardim.
    if (!voice.speak(picked, world.tick * FIXED_DT)) return;

    signal(kind, picked);
    if (voice.size > CREATURE_CAPACITY) voice.forget((entity) => creatures.has(entity));
  };

  const loop = new SimulationLoop(
    FIXED_DT,
    { step, render },
    {
      getSpeed: () => {
        const state = store.getState();
        return state.isRunning ? state.speed : 0;
      },
    },
  );

  const mountCanvas = (container: HTMLElement): (() => void) => {
    const renderer = createRenderer({
      worldWidth: WORLD_CONFIG.width,
      worldHeight: WORLD_CONFIG.height,
    });
    let cancelled = false;

    // Os gestos da mão viram ações no mundo. Nenhum botão envolvido.
    renderer.onSelectedScreen((x, y, visible) => {
      cardAnchor.x = x;
      cardAnchor.y = y;
      cardAnchor.visible = visible;
    });

    renderer.setHandlers({
      onSelect: (id) => {
        if (id === null) {
          clearSelection();
          return;
        }
        // LARGAR EM CIMA DE ALGUÉM.
        //
        // Com a bola, o presente ou o ovo na mão, o clique é sempre "põe isso
        // aqui" — e o lugar mais natural para largar uma bola é justamente aos
        // pés de quem vai brincar com ela. Antes disso, a criatura interceptava
        // o clique e virava seleção: a mão tinha uma bola e o jardim não fazia
        // nada, que é exatamente a interface aparecendo onde não devia.
        const dropping = tool() === TOOL.ball || tool() === TOOL.gift || tool() === TOOL.egg;
        if (dropping) {
          const [dx, dy] = creaturePoint(id);
          dropAt(dx + 18, dy + 8);
          return;
        }

        // COMIDA: encostar a maçã na criatura é dar de comer. A fruta cai à
        // frente dela e quem decide comer é ela.
        if (tool() === TOOL.food && !isEgg(world, id)) {
          const [fx, fy] = creaturePoint(id);
          activeRenderer?.emit(
            feedCreature(world, id) === 'given' ? 'star' : 'question',
            fx,
            fy - 14,
          );
          return;
        }

        // ENSINO: apontar uma criatura é dizer "amigo" para quem estiver
        // olhando — inclusive para ela mesma.
        if (tool() === TOOL.book && !isEgg(world, id)) {
          nameThing(world, ...creaturePoint(id), WORD.friend);
          const spot = world.store(Transform).get(id);
          if (spot) activeRenderer?.say(WORD.friend, spot.x, spot.y - 24);
          return;
        }

        // O PRIMEIRO ovo nasce no toque.
        //
        // Enquanto não há nenhuma criatura viva, o jardim inteiro é uma casca
        // no chão — e pedir cinquenta segundos de mão parada antes que qualquer
        // coisa aconteça é cobrar paciência de quem ainda não conhece ninguém
        // ali dentro. Do segundo ovo em diante, quando já há gente no jardim e
        // já existe motivo para esperar, volta a valer o calor da mão.
        if (isEgg(world, id) && world.store(Creature).size === 0) {
          hatchNow(world, id);
          signal('star', id);
        }
        store.getState().setSelectedId(id);
        cardTimer = CARD_SECONDS;
        pushSelected();
      },
      onGrab: (itemId) => grabItem(world, itemId),
      onDragHeld: (itemId, x, y) => moveHeldItem(world, itemId, x, y),
      onRelease: (itemId, x, y, vx, vy) => {
        // Uma semente pousada com cuidado numa casa vazia vira muda. Atirada,
        // continua sendo semente rolando pelo chão — e semente no chão chama
        // pássaro. O mesmo objeto, dois destinos, decididos pelo gesto.
        if (plantSeed(world, itemId, x, y, Math.hypot(vx, vy))) {
          renderer.setScenery(scenery);
          activeRenderer?.emit('star', x, y - 12);
          return;
        }
        // Sementes largadas no chão chamam os pássaros.
        if (world.store(ItemComponent).get(itemId)?.kind === 'seed') attractBirds(world, x, y);
        const drop = releaseItem(world, itemId, vx, vy);
        // Arrumar uma pilha ou esconder algo tem retorno visual imediato: é
        // assim que o jogador descobre que pode fazer isso.
        if (drop.stacked > 0) activeRenderer?.emit('star', x, y - 12);
        else if (drop.hidden) activeRenderer?.emit('question', x, y - 12);
        // Enfeitar um canto torna o lugar agradável: quem estava por perto
        // passa a lembrar bem dali e volta com mais frequência.
        rememberPleasantPlace(world, x, y, 120);
      },
      onPet: (creatureId, dt) => {
        // A mão parada sobre um ovo o esquenta, e ele rompe mais cedo. É a
        // primeira coisa que o jogador pode fazer por uma criatura — antes
        // mesmo de ela existir —, e quem chocou o ovo ganha o afeto de quem
        // saiu dele.
        if (isEgg(world, creatureId)) {
          warmEgg(world, creatureId, dt);
          signal('heart', creatureId);
          return;
        }

        // BANHO: a esponja na mão transforma o mesmo gesto em esfregar. A
        // espuma sai enquanto a sujeira sai, e quem tem medo não deixa
        // encostar.
        if (tool() === TOOL.bath) {
          // Um sinal por resposta; quem dá o ritmo é o `signal`, não um sorteio
          // por quadro. A espuma é o que diz "está saindo", a interrogação é
          // "ela não deixa" e a estrela é "já está limpa" — três respostas
          // diferentes para três coisas diferentes.
          const reply = scrub(world, creatureId, dt);
          if (reply === 'scrubbing') signal('bubble', creatureId);
          else if (reply === 'refused') signal('question', creatureId);
          else signal('star', creatureId);
          return;
        }

        // ENSINO: o livro em cima da criatura diz o nome dela — "amigo".
        if (tool() === TOOL.book) return;
        if (petCreature(world, creatureId, dt) === 'accepted') signal('heart', creatureId);
      },
      onPetRemembered: (creatureId) => {
        rememberPetting(world, creatureId);
        signal('star', creatureId);
        // Derretida de carinho, ela está olhando para você — e é a única hora
        // em que "você" é uma palavra que ela pode aprender por associação:
        // a coisa nomeada está bem ali, encostada nela.
        showAndTell(world, creatureId, WORD.player);
        pushSelected();
      },
      // O COLO. A criatura sai do chão e atravessa o jardim na mão do jogador
      // — a única maneira de TIRAR um bicho de onde ele se meteu, e a mais
      // íntima de todas as interações: quem confia se aninha, quem não confia
      // se debate, e largar depressa é atirar.
      onLiftCreature: (creatureId) => {
        if (isEgg(world, creatureId)) return;
        if (liftCreature(world, creatureId)) signal('question', creatureId);
      },
      onCarryCreature: (creatureId, x, y) => moveCarried(world, creatureId, x, y),
      onDropCreature: (creatureId, _x, _y, vx, vy) => {
        dropCreature(world, creatureId, vx, vy);
        signal(Math.hypot(vx, vy) >= 320 ? 'anger' : 'heart', creatureId);
        pushSelected();
      },
      onRough: (creatureId, speed, dirX, dirY) => {
        roughGesture(world, creatureId, speed, dirX, dirY);
        signal('anger', creatureId);
        pushSelected();
      },
      onCall: (creatureId) => {
        callAttention(world, creatureId);
        signal('question', creatureId);
      },
      onObserve: (creatureId) => observeCreature(world, creatureId),
      onOffer: (itemId, creatureId) => {
        if (offerItem(world, itemId, creatureId)) {
          signal('heart', creatureId);
          pushSelected();
        }
        // A oferta é também uma aula: a fruta na frente do nariz e o nome dela.
        nameIt(itemId, creatureId);
      },
      onHandMove: (x, y, inside) => setHandPresence(world, x, y, inside),

      // Mexer no cenário tem consequência: cai fruta, insetos voam, e as
      // criaturas curiosas vêm ver o que aconteceu.
      onPokeScenery: (kind, index) => {
        const piece = scenery[index];

        // COMIDA: sacudir a árvore com a maçã na mão derruba uma fruta de
        // verdade — é assim que o jogador alimenta sem nenhum menu.
        if (tool() === TOOL.food && piece) {
          const fruit = shakeFruitFrom(world, piece);
          activeRenderer?.shakeTreeAt(index);
          if (fruit >= 0) activeRenderer?.emit('star', piece.x, piece.y - 20);
          else activeRenderer?.emit('question', piece.x, piece.y - 20);
          return;
        }

        // A bola largada debaixo da árvore cai debaixo da árvore, e não sacode
        // a árvore: quem tem uma bola na mão está largando uma bola.
        if (piece && dropAt(piece.x, piece.y + 14)) return;

        // ENSINO: apontar uma árvore ou uma pedra é dizer o nome dela.
        if (tool() === TOOL.book && piece) {
          const named = wordForSpot(world, piece.x, piece.y, false);
          if (named) {
            const heard = nameThing(world, named.x, named.y, named.word);
            activeRenderer?.say(named.word, piece.x, piece.y - 26);
            if (heard === 0) activeRenderer?.emit('question', piece.x, piece.y - 20);
          }
          return;
        }

        if (kind === 'tree') {
          const spot = shakeTree(world, index);
          if (spot.kind !== 'none') {
            activeRenderer?.shakeTreeAt(index);
            activeRenderer?.emit('star', spot.x, spot.y - 30);
          }
        } else if (kind === 'rock') {
          const spot = turnRock(world, index);
          if (spot.kind !== 'none') activeRenderer?.emit('question', spot.x, spot.y - 14);
        } else if (kind === 'computer') {
          // Cutucar a máquina acende a tela e passa para a próxima palavra.
          // É como o jogador descobre para que ela serve: ninguém explica.
          const machine = scenery[index];
          if (machine) {
            machine.word = (machine.word + 1) % WORD_TEXT.length;
            machine.wordTimer = COMPUTER_FLASH;
            activeRenderer?.emit('star', machine.x, machine.y - 40);
          }
        } else {
          pokeProps(world, 0, 0);
        }
      },
      // Arrastar o jardim: árvore e pedra saem do chão e pousam noutra casa.
      onGrabScenery: (index) => {
        // O chão em volta treme quando aquilo se solta da terra.
        const piece = scenery[index];
        if (piece) swayPropsNear(props, piece.x, piece.y, 44);
      },
      // Enquanto está no ar, quem cuida da peça é o renderer: para o mundo ela
      // continua exatamente onde estava até ser largada.
      onDragScenery: () => {},
      onDropScenery: (index, x, y) => {
        const drop = dropScenery(world, index, x, y);
        // Sempre redesenha: mesmo recusada, a peça precisa voltar ao chão.
        renderer.setScenery(scenery);
        if (drop.kind === 'moved') {
          activeRenderer?.emit('star', drop.x, drop.y - 14);
          rememberPleasantPlace(world, drop.x, drop.y, 120);
        } else if (drop.kind !== 'none') {
          // Água ou casa ocupada: a peça volta, e o sinal diz por quê.
          activeRenderer?.emit('question', drop.x, drop.y - 14);
        }
      },
      onPokeGround: (x, y) => {
        // O chão é onde as coisas nascem. Cada ferramenta larga a sua, e o
        // mundo responde na hora — sem diálogo, sem confirmação, sem janela.
        if (dropAt(x, y)) return;
        if (tool() === TOOL.book) {
          const named = wordForSpot(world, x, y, false);
          if (named) {
            nameThing(world, named.x, named.y, named.word);
            activeRenderer?.say(named.word, named.x, named.y - 20);
          }
          return;
        }
        pokeProps(world, x, y);
      },
      // --- Comando de grupo -------------------------------------------
      // O retângulo em si é desenho puro; a simulação só recebe o resultado.
      onMarquee: () => {},
      onMarqueeEnd: (x1, y1, x2, y2) => {
        const dentro = renderer.creaturesInBox(x1, y1, x2, y2);
        store.getState().setSelectedIds(dentro);
        if (dentro.length > 0) {
          cardTimer = CARD_SECONDS;
          pushSelected();
        } else {
          clearSelection();
        }
      },
      onOrder: (x, y, alvo) => {
        const grupo = store.getState().selectedIds;
        if (grupo.length === 0) return;

        // O que há no ponto decide a ordem: fruta é "coma aquilo", água é
        // "beba ali", o computador é "vá aprender", chão é "vá até lá". Um
        // comando só, quatro significados — como num jogo de estratégia, e sem
        // nenhum menu.
        const fruta = orderedFruit(x, y, alvo.item);
        const maquina =
          alvo.scenery?.kind === 'computer' ? (scenery[alvo.scenery.index] ?? null) : null;
        const naAgua = isWaterAt(terrain, x, y);
        const kind = maquina
          ? ORDER.learn
          : fruta >= 0
            ? ORDER.eat
            : naAgua
              ? ORDER.drink
              : ORDER.move;

        // Diante da tela, não em cima dela: quem estuda fica na casa da frente.
        const destinoX = maquina ? maquina.x : x;
        const destinoY = maquina ? maquina.y + 26 : y;

        let obedeceram = 0;
        for (const id of grupo) {
          // Espalha o destino: um grupo inteiro mirando o mesmo pixel vira
          // um empilhamento, e eles se empurram sem chegar nunca.
          const spread = grupo.length > 1 ? 16 + grupo.length * 2 : 0;
          const angle = (obedeceram / Math.max(1, grupo.length)) * Math.PI * 2;
          const alvoX = destinoX + Math.cos(angle) * spread;
          const alvoY = destinoY + Math.sin(angle) * spread;
          const reply = issueOrder(world, id, kind, alvoX, alvoY, fruta);
          if (reply === 'accepted') obedeceram += 1;
          else if (reply === 'refused') signal('question', id);
        }
        if (obedeceram > 0) activeRenderer?.emit('star', destinoX, destinoY - 8);
      },
      onPokeWater: (x, y) => {
        if (tool() === TOOL.book) {
          const named = wordForSpot(world, x, y, true);
          if (named) {
            nameThing(world, named.x, named.y, named.word);
            activeRenderer?.say(named.word, x, y - 12);
          }
          return;
        }
        touchWater(world, x, y);
        activeRenderer?.ripple(x, y);
      },
    });

    // Só a mão e a comida levantam coisas do chão. Com a esponja, o livro ou o
    // ovo, apertar em cima de uma fruta não a arranca do mundo.
    renderer.setGrabTest(() => tool() === TOOL.hand || tool() === TOOL.food);
    // E mandar é gesto de mão vazia: com a bola, o presente ou o ovo na mão, o
    // toque no chão é aquilo, não uma ordem.
    renderer.setOrderTest(() => tool() === TOOL.hand);
    // O QUE ESTÁ NA SUA MÃO, DENTRO DO JARDIM.
    //
    // A ordem do cinto é a mesma do atlas de ícones — comida 0, bola 1,
    // esponja 2... —, então a ferramenta É o índice do desenho. A mão nua
    // (-1) continua sendo a mãozinha animada de sempre.
    renderer.setToolIcon(() => (tool() === TOOL.hand ? -1 : tool()));
    // E só a mão nua machuca: esfregar com vontade não pode ser pancada.
    renderer.setRoughTest(() => tool() === TOOL.hand);

    void renderer.mount(container).then(() => {
      if (cancelled) return;
      renderer.setTerrain(terrain, WATER, WORLD_SEED);
      renderer.setScenery(scenery);
      renderer.setProps(props);
      // O jogo abre OLHANDO para o primeiro ovo. Sem isto ele nasce em algum
      // canto de um jardim de novecentos por novecentos, e o jogador começa a
      // partida procurando o próprio jogo.
      forEachEgg(world, (_id, _progress, x, y) => renderer.lookAt(x, y));
      activeRenderer = renderer;
    });

    if (!loop.isRunning) loop.start();

    return () => {
      cancelled = true;
      if (activeRenderer === renderer) activeRenderer = null;
      renderer.destroy();
    };
  };

  // Controles invisíveis: existem para quem procurar, sem ocupar a tela.
  // Espaço pausa, 1/2/4 mudam a velocidade.
  // A música começa junto com o jogo. Se o navegador barrar o áudio — e ele
  // barra, enquanto ninguém tocou na página —, ela entra sozinha no primeiro
  // clique. O jogador nunca precisa apertar "tocar".
  const music = createMusic();
  music.start();

  const onKeyDown = (event: KeyboardEvent): void => {
    const state = store.getState();
    if (event.key === 'm' || event.key === 'M') {
      music.toggleMute();
      return;
    }
    if (event.key === 'd' || event.key === 'D') {
      state.toggleDebug();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      state.toggleRunning();
    } else if (event.key === '1') state.setSpeed(1);
    else if (event.key === '2') state.setSpeed(2);
    else if (event.key === '4') state.setSpeed(4);
    // As marchas altas: é nelas que uma tarde de jardim cabe num café.
    else if (event.key === '8') state.setSpeed(8);
    else if (event.key === '9') state.setSpeed(16);
    else if (event.key === '0') state.setSpeed(32);
  };
  window.addEventListener('keydown', onKeyDown);

  const root = createRoot(rootElement);
  root.render(createElement(StrictMode, null, createElement(App, { mountCanvas })));

  return {
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown);
      music.dispose();
      loop.stop();
      root.unmount();
    },
  };
}
