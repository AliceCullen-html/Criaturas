import { clamp01, type Rng } from '@core';
import { GENE_COUNT, type Genome } from './genome';

const MUTATION_CHANCE = 0.12;
const MUTATION_STRENGTH = 0.14;

/**
 * Cruzamento uniforme: cada gene vem de um dos pais, com pequena chance de
 * mutação. Genes ocasionalmente "mesclam" (média dos pais), o que produz
 * variação contínua além do sorteio binário.
 */
export function breed(parentA: Genome, parentB: Genome, rng: Rng): Genome {
  const child = new Float32Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) {
    const a = parentA[i] ?? 0.5;
    const b = parentB[i] ?? 0.5;
    let gene = rng.chance(0.25) ? (a + b) / 2 : rng.chance(0.5) ? a : b;
    if (rng.chance(MUTATION_CHANCE)) {
      gene += rng.range(-MUTATION_STRENGTH, MUTATION_STRENGTH);
    }
    child[i] = clamp01(gene);
  }
  return child;
}
