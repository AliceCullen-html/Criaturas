import { describe, it, expect } from 'vitest';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Attributes, Creature } from '@creatures';
import {
  ambientSystem,
  createWorld,
  dayNightSystem,
  itemSystem,
  plantGrowthSystem,
  plantSpreadSystem,
  propSystem,
  weatherSystem,
} from '@world';
import { spawnCreatures } from './spawnCreatures';
import { foodIndexSystem } from './foodIndex';
import { creatureIndexSystem } from './creatureIndex';
import { emotionSystem } from './systems/emotionSystem';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { metabolismSystem } from './systems/metabolismSystem';
import { reproductionSystem } from './systems/reproductionSystem';
import { searchSystem } from './systems/searchSystem';
import { idleSystem } from './systems/idleSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * O jardim precisa se sustentar sozinho.
 *
 * Não é um teste de unidade: roda o mundo inteiro por meia hora simulada e
 * cobra duas coisas que a etapa do "mundo compacto" prometeu — a população não
 * se extingue nem explode, e ninguém passa a vida inteira sozinho. Sem isso,
 * nenhuma história social tem como acontecer.
 */

const WORLD = { width: 600, height: 600 };
const CREATURES = 18;
const DT = 1 / 20;
const MINUTES = 30;

function makeGarden(seed: number): World {
  const world = createWorld(WORLD, seed);
  spawnCreatures(world, CREATURES);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

const gardenScheduler = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(emotionSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(reproductionSystem)
    .add(metabolismSystem)
    .add(itemSystem)
    .add(searchSystem)
    .add(weatherSystem)
    .add(dayNightSystem)
    .add(ambientSystem)
    .add(propSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);

/** Fração da população que enxerga pelo menos uma companheira agora. */
function fractionWithCompany(world: World): number {
  const transforms = world.store(Transform);
  const attributes = world.store(Attributes);
  const spots: Array<{ x: number; y: number; vision: number }> = [];
  world.store(Creature).forEach((_tag, entity) => {
    const transform = transforms.get(entity);
    const attrs = attributes.get(entity);
    if (transform && attrs) spots.push({ x: transform.x, y: transform.y, vision: attrs.vision });
  });
  if (spots.length <= 1) return 0;

  let accompanied = 0;
  for (let i = 0; i < spots.length; i++) {
    const self = spots[i]!;
    for (let j = 0; j < spots.length; j++) {
      if (i === j) continue;
      const other = spots[j]!;
      if (Math.hypot(other.x - self.x, other.y - self.y) <= self.vision) {
        accompanied += 1;
        break;
      }
    }
  }
  return accompanied / spots.length;
}

describe('o jardim se sustenta', () => {
  for (const seed of [1337, 7, 99]) {
    it(`seed ${seed}: população viva e acompanhada por ${MINUTES} minutos`, () => {
      const world = makeGarden(seed);
      const scheduler = gardenScheduler();

      let lowest = Infinity;
      let highest = 0;
      let companySum = 0;
      let samples = 0;

      for (let tick = 0; tick < 20 * 60 * MINUTES; tick++) {
        scheduler.update(world, DT);
        if (tick % (20 * 30) !== 0) continue;
        const population = world.store(Creature).size;
        lowest = Math.min(lowest, population);
        highest = Math.max(highest, population);
        companySum += fractionWithCompany(world);
        samples += 1;
      }

      const company = companySum / samples;
      // Falha explica o que aconteceu, para não virar caça ao número.
      const report = `min=${lowest} max=${highest} companhia=${(company * 100).toFixed(0)}%`;

      console.log(`seed ${seed}: ${report}`);

      // Piso de 6, e não um número redondo qualquer: medi a distribuição em dez
      // mundos de 30 minutos e o pior mínimo foi 7, sem nenhuma extinção. Um
      // vale momentâneo num jardim que volta a 30 não é colapso — o que este
      // teste tem de pegar é o mundo que MORRE.
      expect(lowest, `extinção — ${report}`).toBeGreaterThanOrEqual(6);
      expect(highest, `superpopulação — ${report}`).toBeLessThanOrEqual(40);
      expect(company, `solidão — ${report}`).toBeGreaterThan(0.7);
    });
  }
});
