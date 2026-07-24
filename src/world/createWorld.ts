import { Sprite, Transform, World, type WorldConfig } from '@engine';
import { createRng } from '@core';
import { Plant } from './components';
import { generateTerrain, isWaterAt } from './terrain';
import { TerrainResource } from './terrainResource';
import { spawnPlant } from './plant';

const TERRAIN_CELL_SIZE = 25;
const INITIAL_PLANTS = 80;

/**
 * Monta um mundo da Etapa 2: terreno com lagos + uma população inicial de
 * plantas semeada em solo. Tudo derivado da seed → reprodutível.
 */
export function createWorld(config: WorldConfig, seed: number): World {
  const world = new World(config, createRng(seed));
  world.register(Transform);
  world.register(Sprite);
  world.register(Plant);

  const terrain = generateTerrain(config.width, config.height, TERRAIN_CELL_SIZE, world.rng);
  world.setResource(TerrainResource, terrain);

  let placed = 0;
  let attempts = 0;
  const maxAttempts = INITIAL_PLANTS * 20;
  while (placed < INITIAL_PLANTS && attempts < maxAttempts) {
    attempts++;
    const x = world.rng.range(0, config.width);
    const y = world.rng.range(0, config.height);
    if (isWaterAt(terrain, x, y)) continue;
    spawnPlant(world, x, y);
    placed++;
  }

  return world;
}
