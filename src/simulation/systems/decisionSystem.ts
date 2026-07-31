import { WORD, clamp, placeSpot, subjects, type CreatureMemory } from '@core';
import { Transform, Velocity, type System } from '@engine';
import {
  Habits,
  Attributes,
  Bio,
  Bond,
  Creature,
  Emotions,
  Memory,
  Mind,
  Needs,
  Nest,
  Personality,
  Words,
} from '@creatures';
import type { PerceivedCreature, PerceivedFood, Perception } from '@ai';
import {
  AmbientResource,
  Ball,
  Item,
  Plant,
  SceneryResource,
  TerrainResource,
  WeatherResource,
  findNearestWater,
} from '@world';
import { FoodIndexResource } from '../foodIndex';
import { CreatureIndexResource } from '../creatureIndex';
import { BrainResource } from '../brainResource';
import { PlayerResource } from '../player';
import { WatchedResource } from '../watched';
import { goalSpot } from './goalSystem';

/** A experiência de quem ainda não tem componente de experiência: nenhuma. */
const VAZIO: readonly number[] = [];
import { isBaby } from '../age';

const candidates: number[] = [];
const perceivedCreatures: PerceivedCreature[] = [];
const perceivedFood: PerceivedFood[] = [];
const hiddenSpots: Array<{ x: number; y: number }> = [];
const hunch = { x: 0, y: 0, distance: 0 };
const WANDER_RANGE = 150;

/**
 * A DERIVA PARA UM LUGAR LEMBRADO.
 *
 * Quando ela está indo a um lugar de que gosta, o passeio ainda é passeio: o
 * sorteio continua valendo, só que espalhado em volta do destino em vez de em
 * volta dela. Um terço do alcance é o bastante para ela chegar POR PERTO e não
 * em cima do ponto — quem vai sempre à mesma coordenada não está lembrando de
 * um lugar, está seguindo uma marca no mapa.
 */
const MEMORY_SPREAD = 0.35;
/** Abaixo desta opinião um lugar não puxa ninguém: é só um lugar. */
const MEMORY_PULL = 0.12;
/** Lugares mais longe que isto ainda puxam, mas cada vez menos. */
const MEMORY_REACH = 320;
/**
 * A chance máxima de um passeio virar uma visita.
 *
 * Nunca 100%: uma criatura que fosse ao lugar bom TODA vez que resolvesse
 * passear pararia de explorar, e o jardim viraria três criaturas em cima de
 * três pontos. Metade das vezes ela vai; na outra metade sai à toa, e é dessa
 * metade que saem os lugares novos.
 */
const MEMORY_CHANCE = 0.5;

/**
 * O melhor lugar que ela lembra — se algum valer a caminhada.
 *
 * O "dado" é o capricho do momento, e não um sorteio novo: é o mesmo número que
 * já inclina as decisões dela, trocado a cada dezoito segundos. Assim a escolha
 * de ir ou não ir dura o tempo de uma travessia, em vez de mudar a cada passo —
 * e nenhum número aleatório novo é consumido, o que deixa um jardim de semente
 * fixa continuar sendo o mesmo jardim.
 */
function rememberedSpot(
  memory: CreatureMemory,
  x: number,
  y: number,
  whim: number,
): { x: number; y: number } | null {
  const hereCell = subjects.place(x, y);
  let best: { x: number; y: number } | null = null;
  let bestPull = MEMORY_PULL;
  memory.forEachAbout('place:', (subject, trace) => {
    // O lugar onde ela JÁ ESTÁ não puxa: senão ela chega e fica.
    if (subject === hereCell) return;
    const opinion = trace.valence * trace.strength;
    if (opinion <= 0) return;
    const spot = placeSpot(subject);
    if (!spot) return;
    // Longe pesa menos, mas não deixa de pesar: um lugar muito bom compensa a
    // caminhada, e é assim que uma criatura atravessa o jardim para voltar
    // onde comeu bem.
    const pull = opinion / (1 + Math.hypot(spot.x - x, spot.y - y) / MEMORY_REACH);
    if (pull <= bestPull) return;
    bestPull = pull;
    best = spot;
  });
  if (!best) return null;
  // Quanto melhor a lembrança, mais provável a visita — até o teto.
  return whim < Math.min(MEMORY_CHANCE, bestPull * 1.5) ? best : null;
}

/** O quanto a sede estende o alcance da água além do que a vista enxerga. */
const THIRST_MEMORY = 700;
/**
 * O que a palavra "água" acrescenta ao alcance da lembrança.
 *
 * Aqui está o motivo de a linguagem existir neste jogo. Uma criatura que sabe
 * dizer "água" não enxerga mais longe: ela CONSEGUE PENSAR na água sem estar
 * vendo o lago, e por isso vai até ele antes de estar morrendo de sede. É a
 * diferença entre reagir e planejar, e ela cabe nesta constante.
 */
const WORD_RECALL = 260;
/** E "fruta" faz reparar em comida que os outros passam sem ver. */
const WORD_EYE = 1.35;
/**
 * O quanto a fome estica a vista.
 *
 * Com fome cheia, a criatura enxerga comida ao dobro da distância. Não é
 * super-visão: é atenção. O mesmo já valia para a sede, que puxa a água de
 * setecentos pixels — a comida era a única necessidade que dependia de sorte.
 */
const HUNGER_EYE = 1.2;
/**
 * De quão longe a máquina chama a atenção.
 *
 * Bem mais que a visão comum, e por um motivo concreto: ela é a coisa mais alta
 * do jardim depois das árvores e a única que ACENDE. Medido, com o alcance
 * preso à visão as criaturas passavam vinte e cinco minutos sem chegar a menos
 * de cinquenta pixels dela — a linguagem existia no código e não acontecia
 * nunca no mundo. Uma luz que ninguém vê não ensina ninguém.
 */
const MACHINE_SIGHT = 300;
/**
 * O quanto a bola chama a atenção além da vista comum.
 *
 * Uma coisa que se mexe sozinha no meio do mato é vista de longe — e a bola é a
 * única coisa do jardim que quica.
 */
const BALL_SIGHT = 1.6;
/** Segundos batendo no mesmo obstáculo antes de desistir do alvo. */
const GIVE_UP_AFTER = 1.6;
/** A que distância ela vai dar a volta ao desistir. */
const DETOUR = 70;
/** Perto o bastante da cama para se deitar. */
const SLEEP_REACH = 14;
const NO_TARGET = -1;

/** O ponto suspeito mais próximo, dentro do alcance da visão. */
function nearestHunch(x: number, y: number, vision: number): typeof hunch | null {
  let best: typeof hunch | null = null;
  for (let i = 0; i < hiddenSpots.length; i++) {
    const spot = hiddenSpots[i]!;
    const distance = Math.hypot(spot.x - x, spot.y - y);
    if (distance > vision || (best && distance >= hunch.distance)) continue;
    hunch.x = spot.x;
    hunch.y = spot.y;
    hunch.distance = distance;
    best = hunch;
  }
  return best;
}

/**
 * Monta a percepção de cada criatura e pede uma decisão ao seu cérebro.
 * O sistema não sabe *como* a decisão é tomada — só aplica o resultado.
 */
export const decisionSystem: System = {
  name: 'decision',
  update(world, dt) {
    const creatures = world.store(Creature);
    const transforms = world.store(Transform);
    const nests = world.store(Nest);
    const bonds = world.store(Bond);
    const velocities = world.store(Velocity);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const traitsStore = world.store(Personality);
    const attributesStore = world.store(Attributes);
    const bios = world.store(Bio);
    const minds = world.store(Mind);
    const memories = world.store(Memory);
    const plants = world.store(Plant);
    const items = world.store(Item);
    const lexicons = world.store(Words);

    const terrain = world.getResource(TerrainResource);
    const foodIndex = world.getResource(FoodIndexResource);
    const creatureIndex = world.getResource(CreatureIndexResource);
    const brain = world.getResource(BrainResource);
    const player = world.getResource(PlayerResource);
    const ambient = world.getResource(AmbientResource);
    const scenery = world.getResource(SceneryResource);
    const weather = world.getResource(WeatherResource);
    // O PAINEL É OPCIONAL, E A SIMULAÇÃO NÃO DEPENDE DELE.
    //
    // Pedir o recurso direto quebrou cinquenta e um testes de uma vez: eles
    // montam o jardim com os sistemas de que precisam e nada mais, que é como
    // deve ser. Uma ferramenta de depuração que obriga todo mundo a instalá-la
    // deixou de ser opcional.
    const habitsStore = world.hasComponent(Habits) ? world.store(Habits) : null;
    const watched = world.hasResource(WatchedResource) ? world.getResource(WatchedResource) : null;
    const { rng, config } = world;

    // Objetos que o jogador escondeu atrás de pedras. São poucos, e ficam fora
    // do índice de comida de propósito: só quem procurar encontra.
    hiddenSpots.length = 0;
    items.forEach((item, entity) => {
      if (!item.hidden || item.held) return;
      const transform = transforms.get(entity);
      if (transform) hiddenSpots.push({ x: transform.x, y: transform.y });
    });

    creatures.forEach((_tag, entity) => {
      const mind = minds.get(entity);
      if (!mind) return;

      mind.commitment -= dt;
      mind.actionCooldown = Math.max(0, mind.actionCooldown - dt);

      // Barrada há tempo demais: o plano não vai dar certo por este caminho.
      //
      // Como ninguém calcula rota, insistir contra uma pedra ou contra a
      // margem do lago é um beco sem saída — a criatura fica encostada nele
      // até morrer de fome. Aqui ela faz o que um bicho faria: larga o alvo e
      // dá uma volta, e da próxima vez chega por outro ângulo.
      if (mind.blocked > GIVE_UP_AFTER) {
        mind.blocked = 0;
        mind.commitment = 0;
        mind.intent = 'wander';
        mind.targetEntity = NO_TARGET;
        const transform = transforms.get(entity);
        if (transform) {
          const away = rng.range(0, Math.PI * 2);
          mind.targetX = clamp(transform.x + Math.cos(away) * DETOUR, 4, config.width - 4);
          mind.targetY = clamp(transform.y + Math.sin(away) * DETOUR, 4, config.height - 4);
          mind.commitment = 1.5;
        }
      }

      const transform = transforms.get(entity);
      const velocity = velocities.get(entity);
      const needs = needsStore.get(entity);
      const emotions = emotionsStore.get(entity);
      const traits = traitsStore.get(entity);
      const attributes = attributesStore.get(entity);
      const bio = bios.get(entity);
      const memory = memories.get(entity);
      if (
        !transform ||
        !velocity ||
        !needs ||
        !emotions ||
        !traits ||
        !attributes ||
        !bio ||
        !memory
      ) {
        return;
      }

      // Reavalia só quando o compromisso expira — evita indecisão a cada tick.
      if (mind.commitment <= 0) {
        perceivedCreatures.length = 0;
        creatureIndex.query(transform.x, transform.y, attributes.vision, candidates);
        for (let i = 0; i < candidates.length; i++) {
          const otherId = candidates[i]!;
          if (otherId === entity) continue;
          const otherTransform = transforms.get(otherId);
          const otherTraits = traitsStore.get(otherId);
          const otherAttributes = attributesStore.get(otherId);
          const otherBio = bios.get(otherId);
          if (!otherTransform || !otherTraits || !otherAttributes || !otherBio) continue;
          const distance = Math.hypot(
            otherTransform.x - transform.x,
            otherTransform.y - transform.y,
          );
          if (distance > attributes.vision) continue;
          perceivedCreatures.push({
            id: otherId,
            x: otherTransform.x,
            y: otherTransform.y,
            distance,
            size: otherAttributes.size,
            aggression: otherTraits.aggression,
            isBaby: isBaby(otherBio),
            affinity: memory.valenceOf(subjects.creature(otherId)),
            sex: otherBio.sex,
            fertile:
              !isBaby(otherBio) &&
              otherBio.matingCooldown <= 0 &&
              otherBio.sex !== 'none' &&
              bio.sex !== 'none' &&
              otherBio.sex !== bio.sex,
          });
        }

        // Quem sabe a palavra "fruta" repara em comida mais longe: ter o nome
        // da coisa é ter a coisa na cabeça enquanto se olha o mundo.
        //
        // E QUEM ESTÁ COM FOME repara mais ainda. É o mesmo princípio da sede,
        // que já puxava a água de bem longe: com fome, a atenção se estreita no
        // que resolve a fome. Sem isto, uma criatura faminta só achava comida
        // por acaso — a vista dela alcança oitenta pixels num jardim de
        // novecentos, e medindo dava nisto: fome em 0,95, fruta a cinquenta
        // pixels, e ela ali brincando de bola. Não era falta de vontade de
        // comer; era não ver a comida.
        const words = lexicons.get(entity);
        const foodSight =
          attributes.vision *
          (words?.knows(WORD.food) ? WORD_EYE : 1) *
          (1 + needs.hunger * HUNGER_EYE);

        perceivedFood.length = 0;
        foodIndex.query(transform.x, transform.y, foodSight, candidates);
        for (let i = 0; i < candidates.length; i++) {
          const foodId = candidates[i]!;
          const foodTransform = transforms.get(foodId);
          if (!foodTransform) continue;
          const distance = Math.hypot(foodTransform.x - transform.x, foodTransform.y - transform.y);
          if (distance > foodSight) continue;

          // Comida pode ser uma planta do chão ou uma fruta caída da árvore.
          const plant = plants.get(foodId);
          const item = items.get(foodId);
          if (!plant && !item) continue;
          if (item && item.held) continue; // na mão do jogador, não é "achável"
          const variant = plant ? plant.variant : item!.variant;

          perceivedFood.push({
            id: foodId,
            x: foodTransform.x,
            y: foodTransform.y,
            distance,
            variant,
            opinion: memory.valenceOf(subjects.food(variant)),
          });
        }

        // Água: enxerga até onde a vista alcança, e LEMBRA muito além disso.
        //
        // Antes o alcance era só a visão. Como o lago fica longe na maior parte
        // do jardim, a criatura com sede máxima simplesmente não tinha a opção
        // de beber na lista — e morria brincando, com o lago a duzentos pixels.
        // Medido: 28 das 34 criaturas iniciais morriam de sede nos primeiros
        // dois minutos, sem nunca terem ido à água uma única vez.
        //
        // Bicho nenhum precisa VER o bebedouro para saber onde ele fica. Este
        // termo é essa lembrança, e ela cresce com a sede: satisfeita, a
        // criatura só repara na água que está à vista; morrendo de sede, ela
        // sabe atravessar o jardim até o lago.
        const reach =
          attributes.vision +
          needs.thirst * THIRST_MEMORY +
          (words?.knows(WORD.water) ? WORD_RECALL : 0);
        const water = findNearestWater(terrain, transform.x, transform.y, reach);

        // Laço e ninho: lidos prontos dos componentes que o sistema social
        // mantém, para a decisão não ter de varrer a memória a cada tick.
        const nest = nests.get(entity);
        const bond = bonds.get(entity);
        let friendView: Perception['friend'] = null;
        if (bond && bond.friend >= 0) {
          const there = transforms.get(bond.friend);
          if (there) {
            friendView = {
              id: bond.friend,
              x: there.x,
              y: there.y,
              distance: Math.hypot(there.x - transform.x, there.y - transform.y),
              strength: bond.friendship,
            };
          }
        }
        const playerDistance = player.present
          ? Math.hypot(player.x - transform.x, player.y - transform.y)
          : Infinity;

        const perception: Perception = {
          self: {
            id: entity,
            x: transform.x,
            y: transform.y,
            age: bio.age,
            isBaby: isBaby(bio),
            needs,
            emotions,
            personality: traits,
            attributes,
            // A EXPERIÊNCIA DELA. Sem o componente — num teste que monta só
            // meia dúzia de sistemas —, a lista vazia faz o cérebro cair no
            // 0,5 de "não sei ainda", que é exatamente o certo.
            habits: habitsStore?.get(entity)?.value ?? VAZIO,
            doing: mind.intent,
            whim: habitsStore?.get(entity)?.whim ?? 0.5,
            memory,
            matingCooldown: bio.matingCooldown,
          },
          creatures: perceivedCreatures,
          food: perceivedFood,
          water,
          player: {
            x: player.x,
            y: player.y,
            present: player.present && playerDistance < attributes.vision * 1.5,
          },
          placeDanger: Math.max(0, -memory.valenceOf(subjects.place(transform.x, transform.y))),
          attention: mind.attention,
          ambient: nearestAmbient(ambient, transform.x, transform.y, attributes.vision),
          shelter: nearestTree(scenery, transform.x, transform.y),
          machine: nearestComputer(scenery, transform.x, transform.y, MACHINE_SIGHT),
          ball: nearestBall(world, transform.x, transform.y, attributes.vision * BALL_SIGHT),
          hunch: nearestHunch(transform.x, transform.y, attributes.vision),
          rain: weather.intensity,
          home: nest ? { x: nest.x, y: nest.y, attachment: nest.attachment } : null,
          friend: friendView,
          rival: bond && bond.rival >= 0 ? { id: bond.rival, strength: bond.rivalry } : null,
        };

        // A CONTA FICA GUARDADA SÓ PARA QUEM ESTÁ SENDO OLHADO.
        //
        // O painel quer ver a decisão sendo tomada — o que ganhou e o que quase
        // ganhou. Pedir isso de todas as criaturas seria alocar uma lista por
        // decisão para ninguém ler; pedir de uma é de graça.
        if (watched && watched.id === entity) perception.explain = true;
        const decision = brain.decide(perception);
        if (watched && watched.id === entity && decision.options) {
          watched.options = decision.options;
          watched.tick = world.tick;
        }
        mind.intent = decision.intent;
        mind.targetEntity = decision.targetEntity;
        mind.commitment = decision.commitment;

        if (decision.intent === 'wander') {
          // OS DOIS SORTEIOS SAEM PRIMEIRO E SEMPRE, aconteça o que acontecer
          // depois. Consumir a fila de números aleatórios de um jeito que
          // dependa da memória da criatura mudaria o mundo inteiro conforme o
          // que ela lembra — e um jardim com semente fixa tem de continuar
          // sendo o mesmo jardim.
          const driftX = rng.range(-WANDER_RANGE, WANDER_RANGE);
          const driftY = rng.range(-WANDER_RANGE, WANDER_RANGE);

          // PARA ONDE ELA DERIVA.
          //
          // Vagar não é sortear um ponto: é ir andando para onde a vida foi boa.
          // Sem isto, tudo o que uma criatura aprende sobre LUGARES não muda
          // nada — o jardim guardava a fruta que caiu ali e o esconderijo achado
          // e nunca voltava a nenhum deles, porque só o lado ruim da lembrança
          // era lido, para desviar. Um bicho que só sabe de onde fugir não tem
          // casa, e um saber sobre lugares que ninguém visita não se espalha.
          // O PROJETO DE VIDA MANDA MAIS QUE A LEMBRANÇA SOLTA.
          //
          // É aqui que um objetivo deixa de ser um número guardado e vira uma
          // criatura vivendo em volta de alguma coisa. Ela ainda come, foge,
          // dorme e briga como sempre — o que muda é para onde ela deriva
          // quando nada aperta, e é dessa deriva que sai "a que mora perto do
          // lago" e "a que anda sempre atrás da irmã".
          const pull =
            goalSpot(world, entity) ??
            rememberedSpot(
              memory,
              transform.x,
              transform.y,
              habitsStore?.get(entity)?.whim ?? 0.5,
            );
          const spread = pull ? MEMORY_SPREAD : 1;
          const fromX = pull ? pull.x : transform.x;
          const fromY = pull ? pull.y : transform.y;
          mind.targetX = clamp(fromX + driftX * spread, 4, config.width - 4);
          mind.targetY = clamp(fromY + driftY * spread, 4, config.height - 4);
        } else {
          mind.targetX = decision.targetX;
          mind.targetY = decision.targetY;
        }
      }

      // Alvos móveis (outra criatura, jogador) são reacompanhados a cada tick.
      if (mind.targetEntity >= 0) {
        const targetTransform = transforms.get(mind.targetEntity);
        if (targetTransform) {
          mind.targetX = targetTransform.x;
          mind.targetY = targetTransform.y;
        } else {
          mind.commitment = 0;
        }
      } else if (mind.intent === 'approachPlayer' && player.present) {
        mind.targetX = player.x;
        mind.targetY = player.y;
      }

      // Machucada anda devagar — mancando. A dor não é só um rosto triste.
      const limp = 1 - emotions.pain * 0.65;

      // Traduz a intenção em movimento.
      //
      // Dormir deixou de ser "parar onde está". Antes esta era a primeira
      // linha do trecho: quem decidia dormir zerava a velocidade na hora, e o
      // ninho escolhido como alvo não servia para nada — a criatura caía no
      // sono a duzentos pixels da própria cama. Agora ela VAI para casa, e
      // devagar, como quem já está com sono. É o que faz as famílias
      // aparecerem dormindo juntas em vez de espalhadas pelo jardim.

      const dx = mind.targetX - transform.x;
      const dy = mind.targetY - transform.y;
      const distance = Math.hypot(dx, dy);
      // Observar é de longe: ninguém persegue uma borboleta até encostar.
      // Procurar e acasalar são o contrário de observar: exigem encostar. Parar
      // a `size` de distância deixava as maiores sem nunca alcançar o par.
      const stopAt =
        mind.intent === 'sleep'
          ? SLEEP_REACH
          : mind.intent === 'seekFood' ||
              mind.intent === 'seekWater' ||
              mind.intent === 'search' ||
              mind.intent === 'mate'
            ? 2
            : // Estudar é de perto, mas não colado: ela para DIANTE da tela.
              mind.intent === 'study'
              ? 30
              : mind.intent === 'watch'
                ? 34
                : mind.intent === 'follow'
                  ? attributes.size * 2.2
                  : attributes.size;

      if (distance < stopAt) {
        velocity.x = 0;
        velocity.y = 0;
        return;
      }

      const haste =
        mind.intent === 'sleep'
          ? 0.6
          : mind.intent === 'flee'
            ? 1.45
            : mind.intent === 'attack' || mind.intent === 'play'
              ? 1.15
              : 1;
      const tired = needs.energy < 0.25 ? 0.55 : 1;
      const speed = attributes.speed * haste * tired * limp;
      velocity.x = (dx / distance) * speed;
      velocity.y = (dy / distance) * speed;
    });
  },
};

/** Bichinho de ambiente mais próximo dentro do campo de visão. */
function nearestAmbient(
  beings: ReadonlyArray<{ x: number; y: number }>,
  x: number,
  y: number,
  vision: number,
): { x: number; y: number; distance: number } | null {
  let best: { x: number; y: number; distance: number } | null = null;
  for (const being of beings) {
    const distance = Math.hypot(being.x - x, being.y - y);
    if (distance > vision) continue;
    if (!best || distance < best.distance) best = { x: being.x, y: being.y, distance };
  }
  return best;
}

/** A bola mais próxima dentro do alcance, se houver alguma. */
function nearestBall(
  world: Parameters<typeof decisionSystem.update>[0],
  x: number,
  y: number,
  reach: number,
): { id: number; x: number; y: number; distance: number } | null {
  if (!world.hasComponent(Ball)) return null;
  const balls = world.store(Ball);
  if (balls.size === 0) return null;
  const transforms = world.store(Transform);
  const items = world.store(Item);
  let best: { id: number; x: number; y: number; distance: number } | null = null;
  balls.forEach((ball, entity) => {
    const item = items.get(entity);
    const spot = transforms.get(entity);
    // Na mão do jogador ela não está disponível: ninguém disputa a bola com a
    // mão que a segura.
    if (!item || !spot || item.held) return;
    const distance = Math.hypot(spot.x - x, spot.y - y);
    // Bola QUICANDO se vê de mais longe do que bola parada. É a diferença entre
    // um objeto largado no mato e um movimento no canto do olho — e é o que faz
    // o jardim inteiro virar a cabeça quando você joga a bola.
    const moving = ball.z > 3 || Math.hypot(item.vx, item.vy) > 20;
    if (distance > reach * (moving ? 1.7 : 1)) return;
    if (!best || distance < best.distance) best = { id: entity, x: spot.x, y: spot.y, distance };
  });
  return best;
}

/** O computador, se estiver ao alcance da vista. */
function nearestComputer(
  scenery: ReadonlyArray<{ kind: string; x: number; y: number }>,
  x: number,
  y: number,
  vision: number,
): { x: number; y: number; distance: number } | null {
  for (const piece of scenery) {
    if (piece.kind !== 'computer') continue;
    const distance = Math.hypot(piece.x - x, piece.y - y);
    // Fica a uma casa de distância da tela, do lado de baixo: é de lá que ela
    // enxerga o que está escrito, e é lá que o jogador a vê parada olhando.
    return distance <= vision ? { x: piece.x, y: piece.y + 22, distance } : null;
  }
  return null;
}

/** Árvore mais próxima — abrigo natural contra a chuva. */
function nearestTree(
  scenery: ReadonlyArray<{ kind: string; x: number; y: number }>,
  x: number,
  y: number,
): { x: number; y: number; distance: number } | null {
  let best: { x: number; y: number; distance: number } | null = null;
  for (const piece of scenery) {
    if (piece.kind !== 'tree') continue;
    const distance = Math.hypot(piece.x - x, piece.y - y);
    if (!best || distance < best.distance) best = { x: piece.x, y: piece.y + 6, distance };
  }
  return best;
}
