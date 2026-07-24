import { Sprite, Transform, type World } from '@engine';
import { Plant } from './components';

export const MAX_PLANTS = 400;

const MIN_MAX_BIOMASS = 6;
const MAX_MAX_BIOMASS = 14;
const MIN_GROWTH_RATE = 0.4;
const MAX_GROWTH_RATE = 1.2;
const SEED_BIOMASS = 1;

const PLANT_PALETTE: readonly number[] = [0x6bbf7b, 0x86c8a8, 0x94c47d, 0x7fbf9a];

/** Número de variantes visuais de recurso (maçã, fruta, cogumelo, flor...). */
export const RESOURCE_VARIANTS = 6;

/** Raio visual em função da biomassa (plantas maiores desenham maiores). */
export function radiusForBiomass(biomass: number): number {
  return 1.5 + biomass * 0.4;
}

/**
 * Cria uma planta no mundo em (x, y). Atributos derivados do RNG do mundo,
 * portanto reprodutíveis.
 */
export function spawnPlant(world: World, x: number, y: number): number {
  const { rng } = world;
  const entity = world.createEntity();

  world.store(Transform).set(entity, { x, y, prevX: x, prevY: y });

  const maxBiomass = rng.range(MIN_MAX_BIOMASS, MAX_MAX_BIOMASS);
  world.store(Plant).set(entity, {
    biomass: SEED_BIOMASS,
    maxBiomass,
    growthRate: rng.range(MIN_GROWTH_RATE, MAX_GROWTH_RATE),
  });

  world.store(Sprite).set(entity, {
    radius: radiusForBiomass(SEED_BIOMASS),
    color: rng.pick(PLANT_PALETTE),
    variant: rng.int(RESOURCE_VARIANTS),
  });

  return entity;
}
