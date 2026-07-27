// Genoma, mapeamento genótipo -> fenótipo, cruzamento e mutação.

export { GENE, GENE_COUNT, randomGenome } from './genome';
export type { Genome } from './genome';
export { express, describePersonality } from './express';
export type { Phenotype, PersonalityTraits } from './express';
export { breed, mutate } from './breed';
export { SPECIES, SPECIES_COUNT, speciesAt } from './species';
export type { Species } from './species';
