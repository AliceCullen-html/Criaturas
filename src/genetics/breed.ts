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

/**
 * Mutação de um genitor só — o DNA do brotamento.
 *
 * `breed` mistura dois genomas; aqui não há com quem misturar. A cópia sai do
 * mesmo DNA com um empurrão em alguns genes, e é DESSE empurrão que vem toda a
 * diversidade da espécie enquanto ela ainda é assexuada: cor, tamanho,
 * metabolismo, coragem, curiosidade, velocidade.
 *
 * A chance de mutação é maior que a do cruzamento de propósito. Com dois pais,
 * a recombinação já produz variedade sozinha; com um só, a mutação é a ÚNICA
 * fonte de diferença — no valor do cruzamento, os brotos sairiam clones.
 */
const BUD_MUTATION_CHANCE = 0.16;
const BUD_MUTATION_STRENGTH = 0.14;

export function mutate(parent: Genome, rng: Rng): Genome {
  const child = new Float32Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) {
    let gene = parent[i] ?? 0.5;
    if (rng.chance(BUD_MUTATION_CHANCE)) {
      gene += rng.range(-BUD_MUTATION_STRENGTH, BUD_MUTATION_STRENGTH);
    }
    child[i] = clamp01(gene);
  }
  return child;
}
