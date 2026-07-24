/**
 * Gerador de números pseudoaleatórios semeado (mulberry32).
 *
 * Toda aleatoriedade da simulação passa por aqui — `Math.random` é PROIBIDO na
 * lógica, pois quebraria o determinismo (mesma seed → mesma sequência de
 * estados), que é a base para save/load e replays.
 */
export interface Rng {
  /** Seed original com que o gerador foi criado. */
  readonly seed: number;
  /** Próximo valor em [0, 1). */
  next(): number;
  /** Inteiro em [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Número real em [min, max). */
  range(min: number, max: number): number;
  /** `true` com a probabilidade dada (0..1). */
  chance(probability: number): boolean;
  /** Escolhe um item do array (não vazio). */
  pick<T>(items: readonly T[]): T;
  /** Estado interno atual — para serializar em saves. */
  getState(): number;
  /** Restaura um estado previamente obtido por `getState`. */
  setState(state: number): void;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    seed,
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    range: (min, max) => min + next() * (max - min),
    chance: (probability) => next() < probability,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) {
        throw new Error('Rng.pick: não é possível escolher de um array vazio.');
      }
      return items[Math.floor(next() * items.length)]!;
    },
    getState: () => state,
    setState: (value) => {
      state = value >>> 0;
    },
  };
}
