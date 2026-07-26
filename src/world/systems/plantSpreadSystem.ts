import { Transform, type System } from '@engine';
import { Plant } from '../components';
import { maxPlants, spawnPlant } from '../plant';
import { TerrainResource } from '../terrainResource';
import { isWaterAt } from '../terrain';

const TAU = Math.PI * 2;
const MATURE_FRACTION = 0.8; // só plantas quase maduras semeiam
const SPREAD_CHANCE_PER_SEC = 0.02; // chance por segundo, por planta madura
const SPREAD_MIN_DIST = 15;
const SPREAD_MAX_DIST = 45;
/** Abaixo desta fração do teto, o jardim recebe semente vinda de fora. */
const BARREN_FRACTION = 0.35;
/** Brotos por segundo quando o jardim está pelado. */
const RESEED_PER_SEC = 0.9;

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
    const cap = maxPlants(world.config);
    if (plants.size >= cap) return;

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
      if (plants.size >= cap) break;
      spawnPlant(world, seedX[i]!, seedY[i]!);
    }

    // Semente de fora.
    //
    // Sem isto o jardim tem um ponto sem volta: as plantas só nascem de plantas
    // maduras, então se as criaturas comerem tudo não sobra semeadeira nenhuma e
    // o chão fica estéril para sempre — a população inteira morre junto e não
    // volta. O vento traz semente de fora, e é isso que dá fundo ao ecossistema.
    if (plants.size < cap * BARREN_FRACTION) {
      let sprouts = Math.floor(RESEED_PER_SEC * dt);
      if (rng.chance(RESEED_PER_SEC * dt - sprouts)) sprouts += 1;
      for (let i = 0; i < sprouts && plants.size < cap; i++) {
        const x = rng.range(0, width);
        const y = rng.range(0, height);
        if (isWaterAt(terrain, x, y)) continue;
        spawnPlant(world, x, y);
      }
    }
  },
};
