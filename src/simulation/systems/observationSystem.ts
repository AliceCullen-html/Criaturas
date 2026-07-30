import { POSE, subjects, type MemorySubject } from '@core';
import { Transform, type System, type World } from '@engine';
import { Behavior, Bio, Creature, Emotions, Identity, Memory, Mind, Personality } from '@creatures';
import { Item, Plant, TerrainResource, findNearestWater } from '@world';
import { CreatureIndexResource } from '../creatureIndex';
import { chronicle } from '../chronicle';
import { isBaby } from '../age';

/**
 * O QUE SE APRENDE OLHANDO OS OUTROS.
 *
 * O medo já atravessava de um bicho para outro; o resto da vida, não. Cada
 * criatura descobria a fruta sozinha, na boca, e o que uma aprendia morria com
 * ela — um jardim de sessenta indivíduos que por acaso dividem o mesmo mapa, e
 * não uma espécie.
 *
 * Aqui está a regra, e é UMA só: **ver outra criatura ter uma experiência forte
 * me dá uma versão fraca da mesma lembrança.** Não há nada escrito sobre comida,
 * sobre água ou sobre ensinar. Há uma criatura olhando outra e tirando dali a
 * conclusão que der.
 *
 * TUDO PASSA PELOS OLHOS, e isso importa mais do que parece. O observador não lê
 * a memória de ninguém: ele vê o GESTO (a boca mastigando, a cabeça na água), vê
 * O QUÊ (a fruta que está sendo comida) e vê a CARA da outra — contente, ou com
 * dor. É dessa leitura que sai a valência, e é por isso que ela pode estar
 * ERRADA: quem vê uma criatura feliz mastigando uma fruta venenosa aprende que
 * aquela fruta é boa, porque foi isso que ela viu. O engano é parte do
 * mecanismo, não um defeito dele — e é dele que saem duas criaturas com opiniões
 * diferentes sobre a mesma coisa.
 *
 * QUEM ENSINA QUEM NÃO ESTÁ ESCRITO EM LUGAR NENHUM. Aprende-se mais de quem se
 * gosta, e o filhote aprende muito mais que o adulto. Como o filhote nasce com
 * laço com quem o gerou e anda perto dele, a família ensinando SAI daí — sem
 * nenhuma regra sobre famílias. Um bicho solitário e desconfiado aprende quase
 * nada dos outros e tem de descobrir tudo na própria boca: é outra vida, e é a
 * mesma conta.
 */

/** De quão longe se enxerga o que outra criatura está fazendo. */
const WATCH_RANGE = 130;
/**
 * O quanto uma lembrança de segunda mão pesa, por segundo de observação.
 *
 * Pequeno de propósito. Comer a fruta deixa um traço de peso 0,25 numa refeição;
 * ver alguém comer, olhando por três segundos, deixa menos de um décimo disso.
 * Ver não é provar — a opinião de quem só assistiu tem de ser frouxa, para a
 * primeira mordida própria poder desmenti-la.
 */
const LEARN_RATE = 0.05;
/** O filhote aprende olhando muito mais que o adulto: é o que ser filhote é. */
const BABY_FACTOR = 2.4;
/** Abaixo deste medo dá para reparar em alguma coisa além do perigo. */
const TOO_SCARED = 0.7;
/** Quanto vale o lugar, comparado com a coisa em si. */
const PLACE_SHARE = 0.6;
/** A partir daqui a criatura "sabe" daquilo — usado só para o livro. */
const KNOWN = 0.12;

const nearby: number[] = [];

/** O que uma cena diz a quem está olhando. */
interface Scene {
  /** Sobre o que é a lição. */
  subject: MemorySubject;
  /** E onde ela aconteceu — um lugar também se aprende. */
  x: number;
  y: number;
  /** Palavra para o livro, quando a lição for a primeira. */
  what: string;
}

/**
 * O QUE ESTA CRIATURA ESTÁ MOSTRANDO AO MUNDO.
 *
 * A leitura é de fora para dentro: só entra aqui o que um bicho a dez passos
 * conseguiria ver. Comer é a boca na fruta — visível, e a fruta também. Beber é
 * a cabeça na água — visível pelo lugar. O que a outra PENSA não aparece, e não
 * deve: telepatia não é observação.
 */
function sceneOf(world: World, actor: number): Scene | null {
  const spot = world.store(Transform).get(actor);
  if (!spot) return null;

  const pose = world.store(Behavior).get(actor)?.pose ?? POSE.none;
  if (pose === POSE.eat) {
    const food = world.store(Mind).get(actor)?.targetEntity ?? -1;
    if (food < 0) return null;
    const plant = world.store(Plant).get(food);
    const item = world.store(Item).get(food);
    const variant = plant ? plant.variant : item?.variant;
    if (variant === undefined) return null;
    return { subject: subjects.food(variant), x: spot.x, y: spot.y, what: 'o que se come' };
  }

  // BEBENDO: não há pose para isso, mas há a cena — um bicho parado na beira
  // da água. É o lugar que se aprende, e é o lugar que interessa.
  if (world.store(Mind).get(actor)?.intent === 'seekWater' && world.hasResource(TerrainResource)) {
    const terrain = world.getResource(TerrainResource);
    if (findNearestWater(terrain, spot.x, spot.y, 18)) {
      return { subject: subjects.place(spot.x, spot.y), x: spot.x, y: spot.y, what: 'onde se bebe' };
    }
  }
  return null;
}

/**
 * A CARA DELA — a única fonte de valência que um observador tem.
 *
 * Contente é bom, dor e aperto são ruins. Nada aqui sabe o que é veneno: quem
 * come uma fruta ruim passa mal, e passar mal aparece no rosto. A lição chega
 * pelo rosto, e não pelo veneno.
 */
function readsAs(emotions: {
  happiness: number;
  pain: number;
  stress: number;
  fear: number;
}): number {
  const bem = emotions.happiness;
  const mal = emotions.pain * 1.5 + emotions.stress * 0.6 + emotions.fear * 0.4;
  return Math.max(-1, Math.min(1, (bem - mal) * 1.4));
}

export const observationSystem: System = {
  name: 'observation',
  update(world, dt) {
    const creatures = world.store(Creature);
    if (creatures.size < 2) return;

    const transforms = world.store(Transform);
    const emotionsStore = world.store(Emotions);
    const memories = world.store(Memory);
    const minds = world.store(Mind);
    const bios = world.store(Bio);
    const traits = world.store(Personality);
    const identities = world.store(Identity);
    const index = world.hasResource(CreatureIndexResource)
      ? world.getResource(CreatureIndexResource)
      : null;

    creatures.forEach((_tag, watcher) => {
      const here = transforms.get(watcher);
      const feel = emotionsStore.get(watcher);
      const memory = memories.get(watcher);
      const mind = minds.get(watcher);
      const bio = bios.get(watcher);
      if (!here || !feel || !memory || !mind || !bio) return;

      // Dormindo não se vê nada. Em pânico também não: quem está fugindo não
      // repara no que o vizinho está comendo.
      if (mind.intent === 'sleep' || feel.fear > TOO_SCARED) return;

      nearby.length = 0;
      if (index) index.query(here.x, here.y, WATCH_RANGE, nearby);
      else creatures.forEach((_t, other) => nearby.push(other));

      // A CENA MAIS PRÓXIMA, e uma só por vez. Uma criatura não assiste a três
      // refeições ao mesmo tempo — e sem isto quem passa no meio de um grupo
      // comendo aprenderia tudo de todos de uma vez.
      let best: Scene | null = null;
      let bestActor = -1;
      let bestDistance = WATCH_RANGE;
      for (const actor of nearby) {
        if (actor === watcher) continue;
        const there = transforms.get(actor);
        if (!there) continue;
        const distance = Math.hypot(there.x - here.x, there.y - here.y);
        if (distance >= bestDistance) continue;
        const scene = sceneOf(world, actor);
        if (!scene) continue;
        best = scene;
        bestActor = actor;
        bestDistance = distance;
      }
      if (!best || bestActor < 0) return;

      const actorFeel = emotionsStore.get(bestActor);
      if (!actorFeel) return;

      // QUEM ENSINA QUEM. Nada disto diz "mãe" ou "filho": diz que se aprende
      // mais de quem se gosta, e mais ainda quando se é pequeno. A família cai
      // dentro dessas duas linhas sozinha, porque é ela que está por perto e é
      // dela que o filhote gosta.
      const affinity = memory.valenceOf(subjects.creature(bestActor));
      // De quem não se conhece aprende-se um pouco; de quem se gosta, quase o
      // triplo; de quem se detesta, quase nada — mas nunca zero, porque uma
      // fruta que fez mal a um desafeto continua tendo feito mal a alguém.
      const trust = Math.max(0.1, Math.min(1.6, 0.55 + affinity * 0.9));
      const curious = 0.6 + (traits.get(watcher)?.curiosity ?? 0.5) * 0.8;
      const near = 1 - bestDistance / WATCH_RANGE;
      const weight =
        LEARN_RATE * trust * curious * near * (isBaby(bio) ? BABY_FACTOR : 1) * (1 - feel.fear) * dt;
      if (weight <= 0) return;

      const lesson = readsAs(actorFeel);
      const before = Math.abs(memory.valenceOf(best.subject));
      memory.record(best.subject, lesson, weight);
      // O LUGAR VEM JUNTO. É a metade que faz a descoberta se espalhar: saber
      // que a fruta é boa não adianta nada a quem não sabe onde ela estava.
      memory.record(subjects.place(best.x, best.y), lesson, weight * PLACE_SHARE);
      const after = Math.abs(memory.valenceOf(best.subject));

      // Ver alguém comendo bem dá vontade — e ver alguém passando mal tira.
      // Não é uma regra sobre comida: é a cara da outra mexendo com esta.
      feel.curiosity = Math.min(1, feel.curiosity + Math.abs(lesson) * weight * 2);

      // A PRIMEIRA VEZ QUE UM SABER ATRAVESSA DE UM BICHO PARA OUTRO.
      if (before < KNOWN && after >= KNOWN) {
        const quem = identities.get(watcher)?.name ?? '?';
        const dequem = identities.get(bestActor)?.name ?? '?';
        chronicle(
          world,
          'aprendeu-olhando',
          `${quem} aprendeu ${best.what} olhando ${dequem}${isBaby(bio) ? ' — ainda é filhote' : ''}`,
          true,
        );
        memory.addEpisode({
          text: `Aprendi vendo ${dequem}`,
          valence: lesson,
          intensity: 0.5,
          emotion: lesson >= 0 ? 'descoberta' : 'nojo',
          tick: world.tick,
          x: here.x,
          y: here.y,
          actor: dequem,
        });
      }
    });
  },
};
