import { Sprite, Transform, World, type WorldConfig } from '@engine';
import { createRng } from '@core';
import { Plant } from './components';
import { generateTerrain, isWaterAt } from './terrain';
import { TerrainResource } from './terrainResource';
import { spawnPlant } from './plant';
import { registerItems, spawnFruit, spawnTrinket } from './items';
import { SceneryResource, generateScenery } from './scenery';
import { WeatherResource, createWeather } from './weather';
import { DayNightResource, createDayNight } from './dayNight';
import { AmbientResource, createAmbient } from './ambient';
import { PropsResource, generateProps } from './props';
import { countFor } from './density';

const TERRAIN_CELL_SIZE = 25;
/** Plantas e bugigangas iniciais num mundo 1000×1000. */
const INITIAL_PLANTS_BASE = 55;
const INITIAL_TRINKETS_BASE = 26;

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
  world.setResource(DayNightResource, createDayNight());
  world.setResource(
    AmbientResource,
    createAmbient(config.width, config.height, seed, (x, y) => isWaterAt(terrain, x, y)),
  );
  world.setResource(
    PropsResource,
    generateProps(terrain, scenery, config.width, config.height, seed),
  );

  // Objetos soltos: o jardim já começa com coisas para mexer.
  const trinkets = ['stick', 'seed', 'feather', 'stone', 'shell'] as const;
  const trinketCount = countFor(INITIAL_TRINKETS_BASE, config.width, config.height, 8);
  for (let i = 0; i < trinketCount; i++) {
    const x = world.rng.range(20, config.width - 20);
    const y = world.rng.range(20, config.height - 20);
    if (isWaterAt(terrain, x, y)) continue;
    spawnTrinket(world, world.rng.pick(trinkets), x, y);
  }

  // Algumas frutas já caídas, para o mundo não começar vazio.
  for (const piece of scenery) {
    if (piece.kind === 'tree' && world.rng.chance(0.3)) {
      spawnFruit(world, piece.x + world.rng.range(-14, 14), piece.y + world.rng.range(4, 16));
    }
  }

  const initialPlants = countFor(INITIAL_PLANTS_BASE, config.width, config.height, 10);
  let placed = 0;
  let attempts = 0;
  const maxAttempts = initialPlants * 20;
  while (placed < initialPlants && attempts < maxAttempts) {
    attempts++;
    const x = world.rng.range(0, config.width);
    const y = world.rng.range(0, config.height);
    if (isWaterAt(terrain, x, y)) continue;
    spawnPlant(world, x, y);
    placed++;
  }

  return world;
}
