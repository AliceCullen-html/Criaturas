import { clamp01, subjects } from '@core';
import { Transform, type World } from '@engine';
import { Emotions, Identity, Memory, Mind, Needs, Personality } from '@creatures';
import { Item } from '@world';

/**
 * Rotinas: pequenas histórias, em vez de ações soltas.
 *
 * O cérebro de utilidade escolhe UMA ação por vez. Isso basta para sobreviver,
 * mas nunca produz "achou uma fruta, olhou em volta, comeu um pedaço, levou o
 * outro para a amiga, uma terceira roubou, elas discutiram e depois fizeram as
 * pazes" — porque cada elo dessa corrente é uma decisão independente que não
 * conhece a anterior.
 *
 * Uma rotina é uma sequência curta de passos com condição de saída. Enquanto
 * dura, ela **conduz** a mente (define intenção e alvo) e o cérebro não
 * interfere; qualquer urgência de verdade — fome, medo, dor — a cancela. É a
 * camada mais fina possível capaz de encadear acontecimentos: nada aqui
 * substitui o cérebro, só amarra o que ele já sabia fazer.
 */

export const ROUTINE = {
  none: 0,
  /** Pega uma fruta e leva para alguém de quem gosta. */
  bringFood: 1,
  /** Toma o que a outra está carregando. */
  steal: 2,
  /** Encara quem roubou e reclama. */
  protest: 3,
  /** Procura quem brigou com ela e faz as pazes. */
  makeUp: 4,
} as const;

export const ROUTINE_NAMES: readonly string[] = [
  '',
  'leva comida para alguém',
  'rouba',
  'reclama',
  'faz as pazes',
];

/** Contexto que cada passo recebe. */
export interface Beat {
  world: World;
  self: number;
  /** Outra criatura envolvida (amiga, ladra, vítima) ou -1. */
  other: number;
  /** Objeto envolvido (a fruta) ou -1. */
  item: number;
  /** Segundos dentro do passo atual. */
  elapsed: number;
}

export interface Step {
  /** Intenção imposta à mente durante o passo. */
  intent: Mind['intent'];
  /** Para onde ir. `null` = fica onde está. */
  aim: (beat: Beat) => { x: number; y: number; entity: number } | null;
  /** O passo terminou? */
  done: (beat: Beat) => boolean;
  /** Efeito ao concluir. */
  finish?: (beat: Beat) => void;
  /** Tempo máximo antes de desistir do passo (e da rotina). */
  limit: number;
}

/**
 * A que distância um passo de aproximação se dá por cumprido.
 *
 * Tem de ser MAIOR que a distância em que a criatura para de andar (que é o
 * tamanho do corpo dela, até uns 13px). Com 12 a rotina travava para sempre no
 * primeiro passo: a criatura chegava, parava, e o passo continuava achando que
 * ela não tinha chegado.
 */
const REACH = 26;

const at = (world: World, entity: number) => world.store(Transform).get(entity);

const near = (world: World, a: number, b: number, reach = REACH): boolean => {
  const first = at(world, a);
  const second = at(world, b);
  if (!first || !second) return false;
  return Math.hypot(first.x - second.x, first.y - second.y) <= reach;
};

const aimAt = (world: World, entity: number) => {
  const spot = at(world, entity);
  return spot ? { x: spot.x, y: spot.y, entity } : null;
};

const nameOf = (world: World, entity: number): string =>
  world.store(Identity).get(entity)?.name ?? 'alguém';

/** Põe o objeto na "boca" da criatura. */
function pickUp(world: World, carrier: number, itemId: number): boolean {
  const item = world.store(Item).get(itemId);
  if (!item || item.held || item.carriedBy >= 0) return false;
  item.carriedBy = carrier;
  item.vx = 0;
  item.vy = 0;
  item.hidden = false;
  item.stack = 0;
  return true;
}

/** Larga o que estiver carregando, onde estiver. */
export function dropCarried(world: World, carrier: number): void {
  world.store(Item).forEach((item) => {
    if (item.carriedBy === carrier) item.carriedBy = -1;
  });
}

/** O objeto que aquela criatura está carregando, ou -1. */
export function carriedBy(world: World, carrier: number): number {
  let found = -1;
  world.store(Item).forEach((item, entity) => {
    if (found < 0 && item.carriedBy === carrier) found = entity;
  });
  return found;
}

// ---------------------------------------------------------------------------
// As rotinas
// ---------------------------------------------------------------------------

/**
 * Levar comida para alguém.
 *
 * Vai até a fruta, para e olha em volta (é o beat que faz a cena respirar),
 * pega, atravessa o jardim e entrega. A entrega vale mais que a comida: fica
 * na memória das duas.
 */
const bringFood: Step[] = [
  {
    // `search`, e não `seekFood`: com `seekFood` o sistema de ação COMIA a
    // fruta ao chegar perto, e a criatura nunca chegava a pegá-la para levar.
    // `search` caminha até encostar e não faz mais nada — que é o necessário.
    intent: 'search',
    aim: ({ world, item }) => aimAt(world, item),
    done: ({ world, self, item }) => near(world, self, item, 20),
    limit: 14,
  },
  {
    // Olha em volta antes de pegar — conferindo se alguém está vendo.
    intent: 'watch',
    aim: () => null,
    done: ({ elapsed }) => elapsed > 1.2,
    limit: 3,
  },
  {
    intent: 'search',
    aim: ({ world, item }) => aimAt(world, item),
    done: ({ world, self, item }) => pickUp(world, self, item),
    limit: 3,
  },
  {
    intent: 'share',
    aim: ({ world, other }) => aimAt(world, other),
    done: ({ world, self, other }) => near(world, self, other),
    limit: 22,
  },
  {
    intent: 'share',
    aim: ({ world, other }) => aimAt(world, other),
    done: ({ elapsed }) => elapsed > 0.4,
    limit: 2,
    finish: ({ world, self, other, item }) => {
      const gift = world.store(Item).get(item);
      const needs = world.store(Needs).get(other);
      if (!gift || gift.carriedBy !== self || !needs) return;

      needs.hunger = clamp01(needs.hunger - 0.35);
      world.destroyEntity(item);

      const theirs = world.store(Emotions).get(other);
      const mine = world.store(Emotions).get(self);
      if (theirs) theirs.happiness = clamp01(theirs.happiness + 0.25);
      if (mine) mine.happiness = clamp01(mine.happiness + 0.15);

      // O laço é o que fica: as duas guardam a cena.
      world.store(Memory).get(other)?.record(subjects.creature(self), 1, 0.7);
      world.store(Memory).get(other)?.addEpisode({
        text: `${nameOf(world, self)} me trouxe comida`,
        valence: 1,
        intensity: 0.8,
        emotion: 'gratidão',
        tick: world.tick,
        x: at(world, other)?.x ?? 0,
        y: at(world, other)?.y ?? 0,
        actor: nameOf(world, self),
      });
      world.store(Memory).get(self)?.record(subjects.creature(other), 0.7, 0.5);
    },
  },
];

/** Tomar o que a outra está carregando. */
const steal: Step[] = [
  {
    intent: 'attack',
    aim: ({ world, other }) => aimAt(world, other),
    done: ({ world, self, other }) => near(world, self, other, 22),
    limit: 14,
  },
  {
    intent: 'attack',
    aim: ({ world, other }) => aimAt(world, other),
    done: ({ elapsed }) => elapsed > 0.3,
    limit: 2,
    finish: ({ world, self, other, item }) => {
      const loot = world.store(Item).get(item);
      if (!loot || loot.carriedBy !== other) return;
      loot.carriedBy = self;

      const victim = world.store(Emotions).get(other);
      if (victim) {
        victim.anger = clamp01(victim.anger + 0.5);
        victim.happiness = clamp01(victim.happiness - 0.2);
      }
      const thief = world.store(Emotions).get(self);
      if (thief) thief.happiness = clamp01(thief.happiness + 0.1);

      world.store(Memory).get(other)?.record(subjects.creature(self), -0.8, 0.6);
      world.store(Memory).get(other)?.addEpisode({
        text: `${nameOf(world, self)} roubou minha comida`,
        valence: -0.8,
        intensity: 0.7,
        emotion: 'indignação',
        tick: world.tick,
        x: at(world, other)?.x ?? 0,
        y: at(world, other)?.y ?? 0,
        actor: nameOf(world, self),
      });
    },
  },
];

/** Encarar quem roubou e reclamar. Barulho, sem sangue. */
const protest: Step[] = [
  {
    intent: 'attack',
    aim: ({ world, other }) => aimAt(world, other),
    done: ({ world, self, other }) => near(world, self, other, 24),
    limit: 12,
  },
  {
    // Frente a frente, reclamando.
    intent: 'attack',
    aim: ({ world, other }) => aimAt(world, other),
    done: ({ elapsed }) => elapsed > 2.5,
    limit: 4,
    finish: ({ world, self, other }) => {
      // A reclamação constrange: quem roubou perde o gosto pela coisa.
      const thief = world.store(Emotions).get(other);
      if (thief) {
        thief.stress = clamp01(thief.stress + 0.25);
        thief.happiness = clamp01(thief.happiness - 0.1);
      }
      const mine = world.store(Emotions).get(self);
      if (mine) mine.anger = clamp01(mine.anger - 0.3);
    },
  },
];

/** Procurar quem brigou e fazer as pazes. */
const makeUp: Step[] = [
  {
    intent: 'socialize',
    aim: ({ world, other }) => aimAt(world, other),
    done: ({ world, self, other }) => near(world, self, other),
    limit: 20,
  },
  {
    intent: 'socialize',
    aim: ({ world, other }) => aimAt(world, other),
    done: ({ elapsed }) => elapsed > 1.5,
    limit: 3,
    finish: ({ world, self, other }) => {
      for (const [a, b] of [
        [self, other],
        [other, self],
      ] as const) {
        const emotions = world.store(Emotions).get(a);
        if (emotions) {
          emotions.anger = clamp01(emotions.anger - 0.5);
          emotions.happiness = clamp01(emotions.happiness + 0.2);
          emotions.loneliness = clamp01(emotions.loneliness - 0.3);
        }
        // Fazer as pazes não apaga a mágoa, mas empurra de volta para o azul.
        world.store(Memory).get(a)?.record(subjects.creature(b), 0.6, 0.45);
      }
      world.store(Memory).get(self)?.addEpisode({
        text: `Fiz as pazes com ${nameOf(world, other)}`,
        valence: 0.7,
        intensity: 0.5,
        emotion: 'alívio',
        tick: world.tick,
        x: at(world, self)?.x ?? 0,
        y: at(world, self)?.y ?? 0,
        actor: nameOf(world, other),
      });
    },
  },
];

export const ROUTINE_STEPS: Record<number, Step[]> = {
  [ROUTINE.bringFood]: bringFood,
  [ROUTINE.steal]: steal,
  [ROUTINE.protest]: protest,
  [ROUTINE.makeUp]: makeUp,
};

/** Quanto uma criatura quer começar cada rotina, dado o que há por perto. */
export function appetiteFor(
  routine: number,
  world: World,
  self: number,
  other: number,
): number {
  const traits = world.store(Personality).get(self);
  const emotions = world.store(Emotions).get(self);
  const needs = world.store(Needs).get(self);
  const memory = world.store(Memory).get(self);
  if (!traits || !emotions || !needs || !memory) return 0;
  const liking = other >= 0 ? memory.valenceOf(subjects.creature(other)) : 0;

  switch (routine) {
    case ROUTINE.bringFood:
      // Gentileza + afeto por aquela criatura, e só com a barriga cheia.
      return (
        (traits.kindness * 1.2 + liking * 0.9) * (1 - needs.hunger) * (1 - emotions.fear) * 0.9
      );
    case ROUTINE.steal:
      // Fome + malandragem, e não se rouba de quem se gosta.
      return (
        (needs.hunger * 1.4 + traits.aggression * 0.7) *
        (1 - traits.kindness * 0.9) *
        (1 - liking) *
        (1 - emotions.fear)
      );
    case ROUTINE.protest:
      return emotions.anger * 1.5 + traits.aggression * 0.5 - traits.kindness * 0.3;
    case ROUTINE.makeUp:
      // Gentis e sociáveis não aguentam ficar de mal.
      return (traits.kindness * 1.1 + traits.sociability * 0.8) * (1 - emotions.anger) * 0.9;
    default:
      return 0;
  }
}
