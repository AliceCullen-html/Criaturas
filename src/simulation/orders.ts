import { clamp01, subjects } from '@core';
import { Transform, defineComponent, type World } from '@engine';
import { Emotions, Memory, Mind, Needs } from '@creatures';
import { Item } from '@world';

/**
 * ORDENS DO JOGADOR.
 *
 * Aqui existe uma tensão que vale nomear, porque ela é o coração do projeto: a
 * regra principal diz que a criatura **nunca pode parecer um NPC esperando
 * ordens**. Selecionar um grupo e mandá-lo andar até um ponto é, literalmente,
 * dar ordens.
 *
 * A saída não é enfraquecer o comando — é dar a ele um custo. A criatura
 * **decide se obedece**:
 *
 * - quem confia em você vai, e ainda vai contente;
 * - quem tem medo de você não vai — recua e mostra que não vai;
 * - quem está morrendo de fome, de sede ou de dor não vai, porque tem
 *   problema próprio, exatamente como já acontece com as rotinas.
 *
 * Com isso o jogo ganha o controle que se pediu e não perde o que ele é: a
 * desobediência deixa de ser um defeito e vira INFORMAÇÃO — é o jeito mais
 * direto de descobrir que aquela ali ainda não confia em você.
 */

export const ORDER = {
  none: 0,
  /** Vá até este ponto. */
  move: 1,
  /** Coma aquilo. */
  eat: 2,
  /** Beba ali. */
  drink: 3,
} as const;

export type OrderKind = (typeof ORDER)[keyof typeof ORDER];

export interface Order {
  kind: number;
  x: number;
  y: number;
  /** O objeto a comer, ou -1. */
  item: number;
  /** Segundos restantes de obediência. Uma ordem não vale para sempre. */
  patience: number;
}
export const Order = defineComponent<Order>('Order');

/** Quanto tempo a criatura persegue uma ordem antes de voltar à própria vida. */
const PATIENCE = 22;
/** Chegou: a partir daqui a ordem de andar está cumprida. */
const ARRIVED = 18;
/** Acima disto ela tem problema próprio e a ordem não se sustenta. */
const PANIC_HUNGER = 0.8;
const PANIC_THIRST = 0.8;
const PANIC_PAIN = 0.3;
/** Abaixo desta opinião sobre você, ela não obedece. */
const DISTRUST = -0.25;
const TERROR = 0.62;

export type OrderReply = 'accepted' | 'refused' | 'impossible';

/**
 * Manda a criatura fazer algo. Ela responde na hora se aceita.
 *
 * A resposta volta para quem chamou porque o jogo precisa MOSTRAR a recusa:
 * uma ordem que some sem nada acontecer parece bug; uma ordem recusada com um
 * ponto de interrogação em cima da cabeça parece uma criatura com opinião.
 */
export function issueOrder(
  world: World,
  id: number,
  kind: OrderKind,
  x: number,
  y: number,
  item = -1,
): OrderReply {
  const mind = world.store(Mind).get(id);
  const emotions = world.store(Emotions).get(id);
  const memory = world.store(Memory).get(id);
  const needs = world.store(Needs).get(id);
  if (!mind || !emotions || !memory || !needs) return 'impossible';

  // Problema próprio primeiro. Ninguém atravessa o jardim a mando de alguém
  // enquanto está morrendo de sede.
  if (needs.hunger > PANIC_HUNGER || needs.thirst > PANIC_THIRST) return 'refused';
  if (emotions.pain > PANIC_PAIN) return 'refused';

  // E medo de você é motivo de sobra para não obedecer.
  const opinion = memory.valenceOf(subjects.player());
  if (opinion < DISTRUST || emotions.fear > TERROR) {
    emotions.stress = clamp01(emotions.stress + 0.08);
    return 'refused';
  }

  world.store(Order).set(id, { kind, x, y, item, patience: PATIENCE });
  // Obedecer é um ato de confiança, e ele se paga: fazer o que você pediu e
  // dar certo aproxima os dois.
  memory.record(subjects.player(), 0.25, 0.06);
  mind.commitment = 0;
  return 'accepted';
}

/** Cancela a ordem em curso (o jogador desistiu, ou ela terminou). */
export function clearOrder(world: World, id: number): void {
  world.store(Order).remove(id);
}

/**
 * Conduz quem está sob ordem.
 *
 * Roda antes da decisão, como a camada de rotinas: enquanto a ordem vale, ela
 * impõe intenção e alvo e segura o compromisso alto, e o cérebro de utilidade
 * não interfere. A diferença para uma rotina é de origem, não de mecanismo —
 * uma nasce da própria criatura, a outra da sua mão.
 */
export const orderSystem = {
  name: 'order',
  update(world: World, dt: number): void {
    const orders = world.store(Order);
    if (orders.size === 0) return;

    const minds = world.store(Mind);
    const transforms = world.store(Transform);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const items = world.store(Item);

    const done: number[] = [];

    orders.forEach((order, self) => {
      const mind = minds.get(self);
      const here = transforms.get(self);
      const needs = needsStore.get(self);
      const emotions = emotionsStore.get(self);
      if (!mind || !here || !needs || !emotions) {
        done.push(self);
        return;
      }

      // A paciência acaba, e a urgência cancela: os dois motivos pelos quais
      // uma criatura viva para de fazer o que mandaram.
      order.patience -= dt;
      if (
        order.patience <= 0 ||
        needs.hunger > PANIC_HUNGER ||
        needs.thirst > PANIC_THIRST ||
        emotions.pain > PANIC_PAIN ||
        emotions.fear > TERROR
      ) {
        done.push(self);
        return;
      }

      if (order.kind === ORDER.eat) {
        const item = items.get(order.item);
        const spot = transforms.get(order.item);
        // A fruta sumiu (alguém comeu antes): a ordem perde o sentido.
        if (!item || !spot || item.held) {
          done.push(self);
          return;
        }
        mind.intent = 'seekFood';
        mind.targetX = spot.x;
        mind.targetY = spot.y;
        mind.targetEntity = order.item;
        mind.commitment = 2;
        return;
      }

      if (order.kind === ORDER.drink) {
        mind.intent = 'seekWater';
        mind.targetX = order.x;
        mind.targetY = order.y;
        mind.targetEntity = -1;
        mind.commitment = 2;
        if (Math.hypot(here.x - order.x, here.y - order.y) < ARRIVED) done.push(self);
        return;
      }

      // Andar até o ponto. Chegando, a ordem termina e ela volta a viver.
      mind.intent = 'wander';
      mind.targetX = order.x;
      mind.targetY = order.y;
      mind.targetEntity = -1;
      mind.commitment = 2;
      if (Math.hypot(here.x - order.x, here.y - order.y) < ARRIVED) {
        // Cumpriu: fica um instante satisfeita de ter feito o que pediram.
        emotions.happiness = clamp01(emotions.happiness + 0.05);
        done.push(self);
      }
    });

    for (const id of done) orders.remove(id);
  },
};
