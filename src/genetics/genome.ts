import type { Rng } from '@core';

/**
 * Genoma: vetor de genes normalizados em 0..1.
 *
 * Manter os genes num array indexado (e não em campos nomeados) torna
 * cruzamento e mutação operações genéricas — adicionar um gene novo não exige
 * tocar na lógica de herança, só na expressão (`express.ts`).
 */
export const GENE = {
  hue: 0,
  features: 1,
  size: 2,
  speed: 3,
  vision: 4,
  metabolism: 5,
  fertility: 6,
  longevity: 7,
  curiosity: 8,
  bravery: 9,
  aggression: 10,
  kindness: 11,
  sociability: 12,
  activity: 13,
  territoriality: 14,
  playfulness: 15,
  species: 16,
  accent: 17,
  eyeHue: 18,
} as const;

export const GENE_COUNT = 19;

export type Genome = Float32Array;

export function randomGenome(rng: Rng): Genome {
  const genes = new Float32Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) genes[i] = rng.next();
  return genes;
}
