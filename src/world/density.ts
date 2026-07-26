import type { WorldConfig } from '@engine';

/**
 * Quantidades proporcionais à área do mundo.
 *
 * Todo número de "quantas coisas existem" no jardim é escrito como **densidade**,
 * não como total: a base é sempre quanto haveria num mundo de referência de
 * 1000×1000. Assim mudar o tamanho do mundo não mexe em como ele parece — a
 * mesma quantidade de grama, flores e borboletas por tela — e o ajuste vira um
 * número só, em vez de uma caçada por constantes espalhadas.
 */

const REFERENCE_AREA = 1000 * 1000;

/** Fração da área do mundo de referência. */
export const areaScale = (width: number, height: number): number =>
  (width * height) / REFERENCE_AREA;

/** `base` = quantos existiriam num mundo 1000×1000. Nunca devolve menos que `min`. */
export function countFor(base: number, width: number, height: number, min = 1): number {
  return Math.max(min, Math.round(base * areaScale(width, height)));
}

/** Mesma coisa, a partir da configuração do mundo. */
export const countIn = (base: number, config: WorldConfig, min = 1): number =>
  countFor(base, config.width, config.height, min);
