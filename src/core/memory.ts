import { clamp } from '@core';

/**
 * Memória associativa + episódica de uma criatura.
 *
 * - **Associativa:** liga um *assunto* (uma fruta, um lugar, o jogador, outra
 *   criatura) a uma valência aprendida (-1 ruim … +1 bom). É o que muda as
 *   decisões futuras — nenhuma regra escrita à mão diz "evite cogumelo": a
 *   criatura simplesmente lembra que passou mal.
 * - **Episódica:** um diário curto e legível, para o jogador entender a
 *   história daquela criatura.
 */

export type MemorySubject = string;

export const subjects = {
  player: (): MemorySubject => 'player',
  food: (variant: number): MemorySubject => `food:${variant}`,
  creature: (id: number): MemorySubject => `creature:${id}`,
  /**
   * Uma COISA, pelo tipo dela: o ursinho, a flor, a almofada.
   *
   * É por aqui que nasce o gosto. Não existe "criatura que gosta de flores"
   * escrito em lugar nenhum do genoma: existe uma criatura que topou com uma
   * flor num dia bom e guardou a lembrança. Da segunda vez ela vai direto.
   */
  thing: (variant: number): MemorySubject => `thing:${variant}`,
  place: (x: number, y: number): MemorySubject =>
    `place:${Math.floor(x / PLACE_CELL)},${Math.floor(y / PLACE_CELL)}`,
} as const;

/**
 * O TAMANHO DE UM LUGAR na cabeça de uma criatura.
 *
 * Cem por cem. Um lugar não é um ponto — é "ali perto da água", "debaixo
 * daquelas árvores". Fino demais e a criatura nunca voltaria duas vezes ao
 * mesmo lugar, porque dois passos ao lado seriam outro lugar; grosso demais e o
 * jardim inteiro vira um lugar só.
 */
export const PLACE_CELL = 100;

/**
 * O caminho de volta: de uma lembrança de lugar para um ponto do jardim.
 *
 * Uma memória que não dá para VISITAR não muda nada. Enquanto isto não existia,
 * o jardim guardava lugares bons — a fruta que caiu ali, o esconderijo achado —
 * e nunca ia a nenhum deles: só o lado ruim era lido, para desviar do que
 * machucou. Uma criatura que só sabe de onde fugir não tem casa.
 */
export function placeSpot(subject: MemorySubject): { x: number; y: number } | null {
  if (!subject.startsWith('place:')) return null;
  const comma = subject.indexOf(',');
  if (comma < 0) return null;
  const cx = Number(subject.slice(6, comma));
  const cy = Number(subject.slice(comma + 1));
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  // O centro da célula: é o "ali" que ela tem na cabeça.
  return { x: cx * PLACE_CELL + PLACE_CELL / 2, y: cy * PLACE_CELL + PLACE_CELL / 2 };
}

export interface MemoryTrace {
  valence: number;
  strength: number;
  encounters: number;
}

/** Uma lembrança episódica completa: o que houve, quando, onde, com quem. */
export interface Episode {
  text: string;
  valence: number;
  /** Quão marcante foi (0..1) — define se resiste ao esquecimento. */
  intensity: number;
  /** Tick da simulação em que aconteceu. */
  tick: number;
  x: number;
  y: number;
  /** Quem causou (nome da criatura, "você", ou null para o mundo). */
  actor: string | null;
  /** Emoção associada, para a UI colorir a lembrança. */
  emotion: string;
  age: number;
}

export interface EpisodeInput {
  text: string;
  valence: number;
  intensity?: number;
  tick?: number;
  x?: number;
  y?: number;
  actor?: string | null;
  emotion?: string;
}

const MAX_EPISODES = 24;
/** Esquecimento bem lento: memórias precisam durar para gerar vínculo. */
const DECAY_PER_SECOND = 0.0012;
/** Lembranças fortes (traumas e afetos) resistem muito mais ao esquecimento. */
const DECAY_RESISTANCE = 0.85;
/**
 * A força com que um lugar entra na memória da primeira vez.
 *
 * Acima do piso em que o esquecimento apaga um traço (0,02), e por pouco: pisar
 * num canto é saber que ele existe, e nada mais. Se ninguém voltar lá, some em
 * poucos segundos.
 */
const FIRST_VISIT = 0.05;

export class CreatureMemory {
  private readonly traces = new Map<MemorySubject, MemoryTrace>();
  readonly episodes: Episode[] = [];

  /** Reforça (ou cria) a associação do assunto com uma experiência boa/ruim. */
  record(subject: MemorySubject, valence: number, weight = 0.5): void {
    const trace = this.traces.get(subject);
    if (!trace) {
      this.traces.set(subject, { valence, strength: weight, encounters: 1 });
      return;
    }
    // Média ponderada: experiências repetidas consolidam a opinião.
    const total = trace.strength + weight;
    trace.valence = clamp((trace.valence * trace.strength + valence * weight) / total, -1, 1);
    trace.strength = Math.min(1, total);
    trace.encounters += 1;
  }

  /** Opinião atual sobre o assunto (0 = indiferente/desconhecido). */
  valenceOf(subject: MemorySubject): number {
    const trace = this.traces.get(subject);
    return trace ? trace.valence * trace.strength : 0;
  }

  /**
   * Percorre os traços de um tipo de assunto (`creature:`, `place:`, ...).
   *
   * A memória guarda tudo num mapa fechado de propósito — ninguém de fora
   * deveria mexer numa lembrança. Mas LER o conjunto é outra coisa: é assim
   * que se descobre de quem esta criatura mais gosta, sem que a memória
   * precise saber o que é amizade.
   */
  forEachAbout(prefix: string, visit: (subject: MemorySubject, trace: MemoryTrace) => void): void {
    for (const [subject, trace] of this.traces) {
      if (subject.startsWith(prefix)) visit(subject, trace);
    }
  }

  knows(subject: MemorySubject): boolean {
    return this.traces.has(subject);
  }

  /**
   * ESTIVE AQUI — sem opinião nenhuma sobre o lugar.
   *
   * Reforça só a FORÇA do traço, e nunca a valência. Usar `record` com valência
   * zero para isto seria um defeito silencioso: `record` faz média ponderada, e
   * então um lugar onde a criatura quase morreu iria virando neutro só de ela
   * ficar parada lá. Conhecer não é perdoar.
   */
  visit(subject: MemorySubject, weight: number): void {
    const trace = this.traces.get(subject);
    if (!trace) {
      // O PRIMEIRO INSTANTE JÁ CONTA. Nascendo com o peso de um tique, o traço
      // nasce ABAIXO do piso do esquecimento e é apagado no mesmo quadro em que
      // é criado — medido: uma criatura meio minuto parada num lugar continuava
      // sem conhecer aquele lugar, e um jardim de sessenta bichos tinha seis
      // cantos conhecidos ao todo. Pisar num lugar é saber que ele existe.
      this.traces.set(subject, { valence: 0, strength: Math.max(weight, FIRST_VISIT), encounters: 1 });
      return;
    }
    trace.strength = Math.min(1, trace.strength + weight);
  }

  /**
   * O QUANTO ISTO LHE É FAMILIAR, de 0 (nunca vi) a 1 (conheço bem).
   *
   * Diferente de `valenceOf`, que pergunta se é bom ou ruim: aqui pergunta-se
   * apenas se ela SABE da existência daquilo, e quanto. Um lugar péssimo e um
   * lugar ótimo podem ser igualmente familiares — e é a familiaridade, não a
   * opinião, que decide se ainda há novidade ali.
   */
  familiarityOf(subject: MemorySubject): number {
    return this.traces.get(subject)?.strength ?? 0;
  }

  addEpisode(input: EpisodeInput): void {
    this.episodes.unshift({
      text: input.text,
      valence: input.valence,
      intensity: input.intensity ?? Math.abs(input.valence),
      tick: input.tick ?? 0,
      x: input.x ?? 0,
      y: input.y ?? 0,
      actor: input.actor ?? null,
      emotion: input.emotion ?? (input.valence >= 0 ? 'alegria' : 'medo'),
      age: 0,
    });
    if (this.episodes.length > MAX_EPISODES) this.episodes.length = MAX_EPISODES;
  }

  /** Esquecimento gradual. Traços fortes decaem bem mais devagar. */
  decay(dt: number): void {
    for (const [subject, trace] of this.traces) {
      const resistance = 1 - Math.abs(trace.valence) * DECAY_RESISTANCE;
      trace.strength -= DECAY_PER_SECOND * resistance * dt;
      if (trace.strength <= 0.02) this.traces.delete(subject);
    }
    for (const episode of this.episodes) episode.age += dt;
  }

  /** Copia parte das lembranças (herança cultural: filhotes aprendem observando). */
  inheritFrom(other: CreatureMemory, fraction: number): void {
    for (const [subject, trace] of other.traces) {
      if (subject.startsWith('creature:')) continue; // laços sociais não se herdam
      this.traces.set(subject, {
        valence: trace.valence,
        strength: trace.strength * fraction,
        encounters: 1,
      });
    }
  }
}
