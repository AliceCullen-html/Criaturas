import { TAU, clamp } from '@core';
import { Sprite, Transform, type World } from '@engine';
import { Identity, Needs } from '@creatures';
import { Plant, radiusForBiomass, spawnPlant } from '@world';

const FEED_MIN_DIST = 10;
const FEED_MAX_DIST = 22;
const FEED_HUNGER_RELIEF = 0.18;

/**
 * "Alimentar": faz nascer uma planta madura ao lado da criatura (que ela vai
 * comer) e dá um alívio imediato de fome, para o clique ser responsivo.
 */
export function feedCreature(world: World, id: number): void {
  const transform = world.store(Transform).get(id);
  if (!transform) return;

  const { rng } = world;
  const angle = rng.range(0, TAU);
  const dist = rng.range(FEED_MIN_DIST, FEED_MAX_DIST);
  const x = clamp(transform.x + Math.cos(angle) * dist, 0, world.config.width);
  const y = clamp(transform.y + Math.sin(angle) * dist, 0, world.config.height);

  const plantId = spawnPlant(world, x, y);
  const plant = world.store(Plant).get(plantId);
  const sprite = world.store(Sprite).get(plantId);
  if (plant && sprite) {
    plant.biomass = plant.maxBiomass;
    sprite.radius = radiusForBiomass(plant.biomass);
  }

  const needs = world.store(Needs).get(id);
  if (needs) needs.hunger = Math.max(0, needs.hunger - FEED_HUNGER_RELIEF);
}

/** Renomeia a criatura. */
export function setCreatureName(world: World, id: number, name: string): void {
  const identity = world.store(Identity).get(id);
  if (identity) identity.name = name;
}
