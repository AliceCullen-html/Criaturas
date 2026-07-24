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
  place: (x: number, y: number): MemorySubject =>
    `place:${Math.floor(x / 100)},${Math.floor(y / 100)}`,
} as const;

export interface MemoryTrace {
  valence: number;
  strength: number;
  encounters: number;
}

export interface Episode {
  text: string;
  valence: number;
  age: number;
}

const MAX_EPISODES = 14;
const DECAY_PER_SECOND = 0.004;
/** Lembranças fortes (traumas e afetos) resistem muito mais ao esquecimento. */
const DECAY_RESISTANCE = 0.55;

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

  knows(subject: MemorySubject): boolean {
    return this.traces.has(subject);
  }

  addEpisode(text: string, valence: number): void {
    this.episodes.unshift({ text, valence, age: 0 });
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
