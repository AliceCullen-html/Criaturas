import type { FeedbackKind } from '@rendering';

/**
 * QUANDO UM BALÃO ESCAPA DA CABEÇA DE UMA CRIATURA.
 *
 * O jardim se explica sem texto: uma gota quando ela vai beber, um coração
 * quando está com carinho, um "?" quando reparou em alguma coisa. É bom — desde
 * que seja RARO. Um símbolo que volta a cada meio segundo deixa de ser um
 * pensamento e vira um LED aceso.
 *
 * Foi exatamente o que aconteceu, e o jogador viu antes de mim: um filhote
 * recém-nascido com uma interrogação infinita subindo na cabeça. Duas coisas se
 * somaram:
 *
 * - O rodízio varre a população de seis em seis por segundo, uma criatura por
 *   vez. Com sessenta criaturas cada uma tem a vez a cada dez segundos; com UMA
 *   criatura — que é como o jogo COMEÇA — ela é escolhida seis vezes por
 *   segundo, para sempre.
 * - O espaçamento que existia era de meio segundo, e vinha da esponja: um gesto
 *   contínuo do jogador DEVE responder sempre, senão parece quebrado. Mas um
 *   balão espontâneo não é resposta a nada — ninguém pediu.
 *
 * Como cada símbolo vive um segundo e meio e nascia um a cada meio segundo,
 * havia três no ar o tempo todo, subindo em fila. Este módulo existe para que
 * essa cadência seja uma coisa que se possa MEDIR, e não um trecho enterrado
 * dentro de um fechamento de novecentas linhas.
 */

/** O que o balão precisa saber sobre a criatura. Nada além disto. */
export interface AmbientMood {
  intent: string;
  affection: number;
  attention: number;
  anger: number;
  happiness: number;
}

/**
 * Silêncio médio de uma criatura entre dois balões, em segundos.
 *
 * Dez: mais que a vida de um símbolo na tela com folga, então nunca há dois da
 * mesma criatura no ar. E é a ordem de grandeza de um pensamento — uma criatura
 * que tem uma ideia a cada dez segundos parece estar pensando; uma que tem duas
 * por segundo parece estar com defeito.
 */
export const AMBIENT_QUIET = 10;

/** O balão que esta criatura mostraria agora, se pudesse. */
export function ambientKindFor(mood: AmbientMood): FeedbackKind | null {
  if (mood.intent === 'seekWater') return 'drop';
  if (mood.intent === 'sleep') return 'sleep';
  if (mood.affection > 0) return 'heart';
  if (mood.anger > 0.5) return 'anger';
  if (mood.attention > 0) return 'question';
  if (mood.happiness > 0.75) return 'heart';
  return null;
}

/**
 * O relógio dos balões — um por criatura.
 *
 * Guarda quando cada uma pode voltar a falar. O intervalo é sorteado numa faixa
 * larga de propósito: um silêncio exato faz o balão bater como metrônomo, e um
 * metrônomo é a coisa menos viva que existe.
 */
export class AmbientVoice {
  private readonly quietUntil = new Map<number, number>();

  constructor(
    private readonly quiet = AMBIENT_QUIET,
    private readonly roll: () => number = Math.random,
  ) {}

  /** Esta criatura pode falar neste instante? Se puder, marca o silêncio. */
  speak(entity: number, now: number): boolean {
    if (now < (this.quietUntil.get(entity) ?? -Infinity)) return false;
    this.quietUntil.set(entity, now + this.quiet * (0.6 + this.roll() * 0.8));
    return true;
  }

  /** Quem morreu não precisa de silêncio guardado. */
  forget(alive: (entity: number) => boolean): void {
    for (const entity of this.quietUntil.keys()) {
      if (!alive(entity)) this.quietUntil.delete(entity);
    }
  }

  get size(): number {
    return this.quietUntil.size;
  }
}
