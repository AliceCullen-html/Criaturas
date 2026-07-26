import { Sprite, Transform, World, type WorldConfig } from '@engine';
import { createRng } from '@core';
import { Plant } from './components';
import { generateTerrain, isWaterAt } from './terrain';
import { TerrainResource } from './terrainResource';
import { spawnPlant } from './plant';
import { registerItems, spawnFruit } from './items';
import { SceneryResource, generateScenery } from './scenery';
import { WeatherResource, createWeather } from './weather';
import { AmbientResource, createAmbient } from './ambient';

const TERRAIN_CELL_SIZE = 25;
const INITIAL_PLANTS = 55;

/**
 * Monta um mundo da Etapa 2: terreno com lagos + uma população inicial de
 * plantas semeada em solo. Tudo derivado da seed → reprodutível.
 */
export function createWorld(config: WorldConfig, seed: number): World {
  const world = new World(config, createRng(seed));
  world.register(Transform);
  world.register(Sprite);
  world.register(Plant);

  registerItems(world);

  const terrain = generateTerrain(config.width, config.height, TERRAIN_CELL_SIZE, world.rng);
  world.setResource(TerrainResource, terrain);

  const scenery = generateScenery(terrain, config.width, config.height, seed);
  world.setResource(SceneryResource, scenery);
  world.setResource(WeatherResource, createWeather());
  world.setResource(AmbientResource, createAmbient(config.width, config.height, seed));

  // Algumas frutas já caídas, para o mundo não começar vazio.
  for (const piece of scenery) {
    if (piece.kind === 'tree' && world.rng.chance(0.3)) {
      spawnFruit(world, piece.x + world.rng.range(-14, 14), piece.y + world.rng.range(4, 16));
    }
  }

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
