import { Transform, type System } from '@engine';
import { Plant } from '../components';
import { MAX_PLANTS, spawnPlant } from '../plant';
import { TerrainResource } from '../terrainResource';
import { isWaterAt } from '../terrain';

const TAU = Math.PI * 2;
const MATURE_FRACTION = 0.8; // só plantas quase maduras semeiam
const SPREAD_CHANCE_PER_SEC = 0.05; // chance por segundo, por planta madura
const SPREAD_MIN_DIST = 15;
const SPREAD_MAX_DIST = 45;

// Buffers reutilizados entre ticks para não alocar no hot path.
const seedX: number[] = [];
const seedY: number[] = [];

/**
 * Plantas maduras ocasionalmente semeiam novas plantas por perto (em solo,
 * nunca na água), com teto populacional — recursos limitados e disseminação
 * emergente.
 */
export const plantSpreadSystem: System = {
  name: 'plant-spread',
  update(world, dt) {
    const plants = world.store(Plant);
    if (plants.size >= MAX_PLANTS) return;

    const transforms = world.store(Transform);
    const terrain = world.getResource(TerrainResource);
    const { rng } = world;
    const { width, height } = world.config;

    seedX.length = 0;
    seedY.length = 0;

    plants.forEach((plant, entity) => {
      if (plant.biomass < plant.maxBiomass * MATURE_FRACTION) return;
      if (!rng.chance(SPREAD_CHANCE_PER_SEC * dt)) return;

      const transform = transforms.get(entity);
      if (!transform) return;

      const angle = rng.range(0, TAU);
      const dist = rng.range(SPREAD_MIN_DIST, SPREAD_MAX_DIST);
      const x = transform.x + Math.cos(angle) * dist;
      const y = transform.y + Math.sin(angle) * dist;

      if (x < 0 || y < 0 || x >= width || y >= height) return;
      if (isWaterAt(terrain, x, y)) return;

      seedX.push(x);
      seedY.push(y);
    });

    for (let i = 0; i < seedX.length; i++) {
      if (plants.size >= MAX_PLANTS) break;
      spawnPlant(world, seedX[i]!, seedY[i]!);
    }
  },
};
