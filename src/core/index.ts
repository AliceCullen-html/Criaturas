// Kernel puro do projeto — sem dependências de framework nem do navegador.
// Regra: este módulo NÃO importa de nenhum outro módulo de `src/`.

export { createRng } from './rng';
export type { Rng } from './rng';
export * from './vector2';
export { SpatialHash } from './spatialHash';
