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
} from '@world';
import { Creature, Emotions, Mind } from '@creatures';
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
  metabolismSystem,
  moveHeldItem,
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
} from '@simulation';
import { createRenderer, type FeedbackKind, type Renderer } from '@rendering';
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

export function createApp(rootElement: HTMLElement): AppInstance {
  const world = createWorld(WORLD_CONFIG, WORLD_SEED);
  // Sem sexo: a espécie começa assexuada e só ganha machos e fêmeas quando
  // a população cruzar o limiar.
  spawnCreatures(world, INITIAL_CREATURES, { sex: 'none', ageFraction: 0.05 });
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  world.setResource(DeathsResource, []);
  world.setResource(ChronicleResource, createChronicle());
  world.setResource(SpeciesResource, {
    phase: PHASE.budding,
    threshold: SEXUAL_THRESHOLD,
    buds: 0,
  });
  chronicle(world, 'genesis', 'O jardim ganhou seu primeiro ser vivo', true);
  const terrain = world.getResource(TerrainResource);
  const scenery = world.getResource(SceneryResource);
  const ambient = world.getResource(AmbientResource);
  const weather = world.getResource(WeatherResource);
  const props = world.getResource(PropsResource);
  const cycle = world.getResource(DayNightResource);

  const scheduler = new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(emotionSystem)
    .add(handReactionSystem)
    .add(socialSystem)
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
    .add(itemSystem)
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

  /** A fruta solta mais próxima do ponto, ou -1. Uma ordem sobre comida
   *  precisa saber em QUAL fruta o jogador clicou. */
  const nearestFruit = (x: number, y: number): number => {
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

  /** Sinal visual sobre uma criatura (coração, gota, estrela). */
  const signal = (kind: FeedbackKind, id: number): void => {
    const transform = world.store(Transform).get(id);
    if (transform) activeRenderer?.emit(kind, transform.x, transform.y - 18);
  };

  const clearSelection = (): void => {
    store.getState().setSelectedId(null);
    store.getState().setSelected(null);
  };

  const pushSelected = (): void => {
    const id = store.getState().selectedId;
    if (id === null) return;
    const snapshot = readCreatureSnapshot(world, id);
    if (!snapshot) {
      clearSelection();
      return;
    }
    store.getState().setSelected(snapshot);
  };

  const step = (dt: number): void => {
    scheduler.update(world, dt);
    world.tick += 1;
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

  /** Balões espontâneos: o mundo se explica sem texto. */
  let ambientCursor = 0;
  const emitAmbientSignals = (): void => {
    const creatures = world.store(Creature);
    if (creatures.size === 0) return;
    const minds = world.store(Mind);
    const emotions = world.store(Emotions);
    let i = 0;
    let picked = -1;
    creatures.forEach((_tag, entity) => {
      if (i++ === ambientCursor % creatures.size) picked = entity;
    });
    ambientCursor += 1;
    if (picked < 0) return;

    const mind = minds.get(picked);
    const feel = emotions.get(picked);
    if (!mind || !feel) return;

    if (mind.intent === 'seekWater') signal('drop', picked);
    else if (mind.intent === 'sleep') signal('sleep', picked);
    else if (mind.affection > 0) signal('heart', picked);
    else if (feel.anger > 0.5) signal('anger', picked);
    else if (mind.attention > 0) signal('question', picked);
    else if (feel.happiness > 0.75) signal('heart', picked);
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
        if (petCreature(world, creatureId, dt) === 'accepted') {
          if (Math.random() < dt * 1.5) signal('heart', creatureId);
        }
      },
      onPetRemembered: (creatureId) => {
        rememberPetting(world, creatureId);
        signal('star', creatureId);
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
      },
      onHandMove: (x, y, inside) => setHandPresence(world, x, y, inside),

      // Mexer no cenário tem consequência: cai fruta, insetos voam, e as
      // criaturas curiosas vêm ver o que aconteceu.
      onPokeScenery: (kind, index) => {
        if (kind === 'tree') {
          const spot = shakeTree(world, index);
          if (spot.kind !== 'none') {
            activeRenderer?.shakeTreeAt(index);
            activeRenderer?.emit('star', spot.x, spot.y - 30);
          }
        } else if (kind === 'rock') {
          const spot = turnRock(world, index);
          if (spot.kind !== 'none') activeRenderer?.emit('question', spot.x, spot.y - 14);
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
      onPokeGround: (x, y) => pokeProps(world, x, y),
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
      onOrder: (x, y) => {
        const grupo = store.getState().selectedIds;
        if (grupo.length === 0) return;

        // O que há no ponto decide a ordem: fruta é "coma aquilo", água é
        // "beba ali", chão é "vá até lá". Um comando só, três significados —
        // como num jogo de estratégia, e sem nenhum menu.
        const fruta = nearestFruit(x, y);
        const naAgua = isWaterAt(terrain, x, y);
        const kind = fruta >= 0 ? ORDER.eat : naAgua ? ORDER.drink : ORDER.move;

        let obedeceram = 0;
        for (const id of grupo) {
          // Espalha o destino: um grupo inteiro mirando o mesmo pixel vira
          // um empilhamento, e eles se empurram sem chegar nunca.
          const spread = grupo.length > 1 ? 16 + grupo.length * 2 : 0;
          const angle = (obedeceram / Math.max(1, grupo.length)) * Math.PI * 2;
          const alvoX = x + Math.cos(angle) * spread;
          const alvoY = y + Math.sin(angle) * spread;
          const reply = issueOrder(world, id, kind, alvoX, alvoY, fruta);
          if (reply === 'accepted') obedeceram += 1;
          else if (reply === 'refused') signal('question', id);
        }
        if (obedeceram > 0) activeRenderer?.emit('star', x, y - 8);
      },
      onPokeWater: (x, y) => {
        touchWater(world, x, y);
        activeRenderer?.ripple(x, y);
      },
    });

    void renderer.mount(container).then(() => {
      if (cancelled) return;
      renderer.setTerrain(terrain, WATER, WORLD_SEED);
      renderer.setScenery(scenery);
      renderer.setProps(props);
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
  const onKeyDown = (event: KeyboardEvent): void => {
    const state = store.getState();
    if (event.code === 'Space') {
      event.preventDefault();
      state.toggleRunning();
    } else if (event.key === '1') state.setSpeed(1);
    else if (event.key === '2') state.setSpeed(2);
    else if (event.key === '4') state.setSpeed(4);
  };
  window.addEventListener('keydown', onKeyDown);

  const root = createRoot(rootElement);
  root.render(createElement(StrictMode, null, createElement(App, { mountCanvas })));

  return {
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown);
      loop.stop();
      root.unmount();
    },
  };
}
