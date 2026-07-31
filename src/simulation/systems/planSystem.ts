import { subjects } from '@core';
import { Transform, defineComponent, type System, type World } from '@engine';
import { Creature, Emotions, Memory, Mind, Needs } from '@creatures';
import { Item } from '@world';
import {
  ROUTINE,
  ROUTINE_STEPS,
  appetiteFor,
  carriedBy,
  dropCarried,
  type Beat,
} from '../routines';

/**
 * Executa as rotinas — a camada que transforma ações soltas em história.
 *
 * Roda ANTES da decisão. Se há um plano em curso, ele impõe intenção e alvo e
 * segura o compromisso alto, então o cérebro de utilidade não interfere. Se não
 * há, procura uma oportunidade: alguém carregando comida, uma fruta no chão com
 * uma amiga por perto, uma raiva pendente de resolver.
 *
 * Qualquer urgência de verdade cancela: fome, sede, medo, dor. Uma criatura
 * faminta não atravessa o jardim para presentear ninguém.
 */

export interface Plan {
  routine: number;
  /** Passo atual dentro da rotina. */
  step: number;
  /** Segundos dentro deste passo. */
  elapsed: number;
  /** A outra criatura envolvida, ou -1. */
  other: number;
  /** O objeto envolvido, ou -1. */
  item: number;
}
export const Plan = defineComponent<Plan>('Plan');

const IDLE: Plan = { routine: ROUTINE.none, step: 0, elapsed: 0, other: -1, item: -1 };

/**
 * O QUE PODE VIRAR TESOURO.
 *
 * Era só `gift` — e presente só existe se o jogador largar um. Numa partida em
 * que ninguém mexeu no jardim, a rotina do tesouro nunca disparava, e com ela
 * ficava de fora a única coisa do jogo que produz GOSTO: a opinião sobre um
 * objeto pelo objeto, que não tem verdade nenhuma por trás. Medido num jardim
 * de cinquenta bichos rodando setenta minutos: ZERO criaturas tinham opinião
 * sobre qualquer coisa do mundo.
 *
 * O mundo já espalha bugigangas sozinho desde sempre — graveto, semente, pena,
 * pedrinha, concha — e elas estavam ali no chão, invisíveis para todo mundo. O
 * comentário logo abaixo já prometia "duas criaturas do mesmo jardim
 * colecionando coisas diferentes"; faltava deixá-las ver o que colecionar.
 */
/**
 * O quanto uma bugiganga do chão atrai, comparada a um presente do jogador.
 *
 * Metade, e a janela é estreita — medida dos dois lados. Em 0,7 e em 1,
 * NINGUÉM brota em vinte minutos de jardim: brotar exige quarenta e cinco
 * segundos seguidos de vida boa, e a criatura não para de catar. Em 0,18 o
 * gosto não chega a existir — zero opiniões sobre coisas em três jardins de
 * setenta minutos. Em 0,5 a espécie vive e o gosto aparece em dois dos três.
 */
const TRINKET_WORTH = 0.5;

const TREASURE: ReadonlySet<string> = new Set([
  'gift',
  'stick',
  'seed',
  'feather',
  'stone',
  'shell',
]);

/** Acima disto a criatura tem problema próprio e larga qualquer história. */
const PANIC_HUNGER = 0.75;
const PANIC_THIRST = 0.75;
const PANIC_FEAR = 0.5;
const PANIC_PAIN = 0.25;

/** Intervalo entre tentativas de começar uma rotina. */
const LOOK_FOR_STORY = 2.5;
/** Nota mínima para valer a pena começar. */
const WORTH_IT = 0.55;
/** Alcance para reparar em oportunidades. */
const NOTICE = 150;

const beat: Beat = { world: null as unknown as World, self: -1, other: -1, item: -1, elapsed: 0 };

export const planSystem: System = {
  name: 'plan',
  update(world, dt) {
    const plans = world.store(Plan);
    const minds = world.store(Mind);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const transforms = world.store(Transform);

    world.store(Creature).forEach((_tag, self) => {
      let plan = plans.get(self);
      if (!plan) {
        plan = { ...IDLE };
        plans.set(self, plan);
      }
      const mind = minds.get(self);
      const needs = needsStore.get(self);
      const emotions = emotionsStore.get(self);
      if (!mind || !needs || !emotions) return;

      const panicking =
        needs.hunger > PANIC_HUNGER ||
        needs.thirst > PANIC_THIRST ||
        emotions.fear > PANIC_FEAR ||
        emotions.pain > PANIC_PAIN;

      if (plan.routine !== ROUTINE.none) {
        if (panicking) {
          abandon(world, self, plan);
          return;
        }
        advance(world, self, plan, mind, dt);
        return;
      }

      // Sem plano: de tempos em tempos, procura uma história para começar.
      plan.elapsed += dt;
      if (plan.elapsed < LOOK_FOR_STORY || panicking) return;
      plan.elapsed = 0;
      if (!transforms.get(self)) return;
      begin(world, self, plan);
    });
  },
};

/** Larga tudo: a rotina não sobrevive a uma urgência. */
function abandon(world: World, self: number, plan: Plan): void {
  dropCarried(world, self);
  plan.routine = ROUTINE.none;
  plan.step = 0;
  plan.elapsed = 0;
  plan.other = -1;
  plan.item = -1;
}

/** Toca o passo atual e avança quando ele termina. */
function advance(world: World, self: number, plan: Plan, mind: Mind, dt: number): void {
  const steps = ROUTINE_STEPS[plan.routine];
  const step = steps?.[plan.step];
  if (!steps || !step) {
    abandon(world, self, plan);
    return;
  }

  // A outra criatura pode ter morrido, e o objeto, sumido.
  if (plan.other >= 0 && !world.store(Creature).has(plan.other)) {
    abandon(world, self, plan);
    return;
  }
  if (plan.item >= 0 && !world.store(Item).has(plan.item)) {
    abandon(world, self, plan);
    return;
  }

  plan.elapsed += dt;
  beat.world = world;
  beat.self = self;
  beat.other = plan.other;
  beat.item = plan.item;
  beat.elapsed = plan.elapsed;

  // Conduz a mente. O compromisso alto é o que impede o cérebro de reescrever
  // o plano no meio da cena.
  mind.intent = step.intent;
  mind.commitment = 2;
  const aim = step.aim(beat);
  if (aim) {
    mind.targetX = aim.x;
    mind.targetY = aim.y;
    mind.targetEntity = aim.entity;
  } else {
    mind.targetEntity = -1;
  }

  if (step.done(beat)) {
    step.finish?.(beat);
    plan.step += 1;
    plan.elapsed = 0;
    if (plan.step >= steps.length) {
      const finished = plan.routine;
      const other = plan.other;
      plan.routine = ROUTINE.none;
      plan.step = 0;
      plan.other = -1;
      plan.item = -1;
      react(world, self, other, finished);
    }
    return;
  }

  // Passo estourou o tempo: a cena não vingou.
  if (plan.elapsed > step.limit) abandon(world, self, plan);
}

/**
 * A consequência da cena na OUTRA criatura.
 *
 * É aqui que a história continua sozinha: quem foi roubada não fica com a
 * indignação parada na ficha — ela vai reclamar. É o encadeamento entre duas
 * criaturas, não dentro de uma só.
 */
function react(world: World, self: number, other: number, finished: number): void {
  if (other < 0 || !world.store(Creature).has(other)) return;
  const theirPlan = world.store(Plan).get(other);
  if (!theirPlan || theirPlan.routine !== ROUTINE.none) return;

  if (finished === ROUTINE.steal) {
    // Levou um roubo: vai tirar satisfação, se tiver estômago para isso.
    if (appetiteFor(ROUTINE.protest, world, other, self) > WORTH_IT) {
      theirPlan.routine = ROUTINE.protest;
      theirPlan.step = 0;
      theirPlan.elapsed = 0;
      theirPlan.other = self;
      theirPlan.item = -1;
    }
  }
}

/** Procura uma oportunidade de história por perto. */
function begin(world: World, self: number, plan: Plan): void {
  const transforms = world.store(Transform);
  const here = transforms.get(self)!;
  const memory = world.store(Memory).get(self);
  const items = world.store(Item);

  let best = { routine: ROUTINE.none as number, score: WORTH_IT, other: -1, item: -1 };

  world.store(Creature).forEach((_tag, other) => {
    if (other === self) return;
    const there = transforms.get(other);
    if (!there) return;
    const distance = Math.hypot(there.x - here.x, there.y - here.y);
    if (distance > NOTICE) return;
    // Fatores MODULAM, não anulam. Multiplicar proximidade crua por fome crua
    // derruba a nota para quase zero e nenhuma história começa — foi o mesmo
    // erro que já tinha impedido o acasalamento de acontecer.
    const closeness = 0.45 + (1 - distance / NOTICE) * 0.55;

    // ---- Roubar: aquela ali está carregando alguma coisa ------------------
    const loot = carriedBy(world, other);
    if (loot >= 0) {
      const score = appetiteFor(ROUTINE.steal, world, self, other) * closeness;
      if (score > best.score) best = { routine: ROUTINE.steal, score, other, item: loot };
    }

    // ---- Levar comida: tem fruta no chão e alguém de quem eu gosto --------
    const theirNeeds = world.store(Needs).get(other);
    if (theirNeeds && theirNeeds.hunger > 0.35) {
      let fruit = -1;
      let bestDistance = NOTICE;
      items.forEach((item, entity) => {
        if (item.kind !== 'fruit' || item.held || item.hidden || item.carriedBy >= 0) return;
        const spot = transforms.get(entity);
        if (!spot) return;
        const away = Math.hypot(spot.x - here.x, spot.y - here.y);
        if (away < bestDistance) {
          bestDistance = away;
          fruit = entity;
        }
      });
      if (fruit >= 0) {
        const score =
          appetiteFor(ROUTINE.bringFood, world, self, other) *
          closeness *
          (0.5 + theirNeeds.hunger * 0.5);
        if (score > best.score) best = { routine: ROUTINE.bringFood, score, other, item: fruit };
      }
    }

    // ---- Fazer as pazes: briguei com essa e não estou mais com raiva ------
    const grudge = memory?.valenceOf(subjects.creature(other)) ?? 0;
    if (grudge < -0.25) {
      const score =
        appetiteFor(ROUTINE.makeUp, world, self, other) * closeness * (0.5 - grudge * 0.5);
      if (score > best.score) best = { routine: ROUTINE.makeUp, score, other, item: -1 };
    }
  });

  // ---- Guardar um tesouro: tem uma coisa bonita largada no chão ----------
  //
  // Não depende de outra criatura, então fica fora do laço de vizinhos. E a
  // nota carrega o GOSTO: uma criatura que já guardou uma flor atravessa o
  // jardim pela próxima; uma que nunca viu decide por curiosidade. É o que faz
  // duas criaturas do mesmo jardim colecionarem coisas diferentes.
  {
    const wish = appetiteFor(ROUTINE.keepGift, world, self, -1);
    if (wish > 0) {
      let treasure = -1;
      let bestScore = 0;
      items.forEach((item, entity) => {
        if (!TREASURE.has(item.kind) || item.held || item.carriedBy >= 0) return;
        const spot = transforms.get(entity);
        if (!spot) return;
        const distance = Math.hypot(spot.x - here.x, spot.y - here.y);
        if (distance > NOTICE) return;
        const taste = memory?.valenceOf(subjects.thing(item.variant)) ?? 0;
        // UMA PENA NO CHÃO NÃO É UM PRESENTE, e a diferença tinha de estar
        // aqui. Abrindo a rotina para as bugigangas do mundo sem pesar nada, o
        // tesouro passou a dominar a vida das criaturas — o jardim está cheio
        // de gravetos, e elas passaram a catar em vez de viver. Medido: com o
        // peso igual, NINGUÉM brotou em vinte minutos de jardim, porque brotar
        // exige quarenta e cinco segundos seguidos de vida boa e elas nunca
        // paravam de colecionar.
        //
        // O presente que veio da sua mão continua valendo o que valia: é raro,
        // foi escolhido, e é o gesto de alguém. A bugiganga do chão é um
        // capricho de vez em quando — o bastante para deixar um gosto, e não
        // para virar profissão.
        const worth = item.kind === 'gift' ? 1 : TRINKET_WORTH;
        const score = wish * worth * (0.45 + (1 - distance / NOTICE) * 0.55) * (1 + taste);
        if (score > bestScore) {
          bestScore = score;
          treasure = entity;
        }
      });
      if (treasure >= 0 && bestScore > best.score) {
        best = { routine: ROUTINE.keepGift, score: bestScore, other: -1, item: treasure };
      }
    }
  }

  if (best.routine === ROUTINE.none) return;
  plan.routine = best.routine;
  plan.step = 0;
  plan.elapsed = 0;
  plan.other = best.other;
  plan.item = best.item;
}
