import { describe, it, expect } from 'vitest';
import { SystemScheduler, Transform } from '@engine';
import { createWorld } from './createWorld';
import { plantGrowthSystem } from './systems/plantGrowthSystem';
import { plantSpreadSystem } from './systems/plantSpreadSystem';
import { Plant } from './components';

const CONFIG = { width: 1000, height: 1000 };

function snapshot(seed: number, steps: number): number[] {
  const world = createWorld(CONFIG, seed);
  const scheduler = new SystemScheduler().add(plantGrowthSystem).add(plantSpreadSystem);
  for (let i = 0; i < steps; i++) {
    scheduler.update(world, 1 / 20);
  }

  const result: number[] = [];
  world.store(Transform).forEach((transform) => {
    result.push(Math.round(transform.x), Math.round(transform.y));
  });
  return result;
}

describe('plantGrowthSystem', () => {
  it('faz a biomassa crescer até o máximo, sem ultrapassar', () => {
    const world = createWorld(CONFIG, 1);
    const scheduler = new SystemScheduler().add(plantGrowthSystem);
    for (let i = 0; i < 2000; i++) {
      scheduler.update(world, 1 / 20);
    }
    world.store(Plant).forEach((plant) => {
      expect(plant.biomass).toBeLessThanOrEqual(plant.maxBiomass + 1e-6);
      expect(plant.biomass).toBeGreaterThan(plant.maxBiomass - 0.5);
    });
  });
});

describe('plantSpreadSystem', () => {
  it('faz a população de plantas crescer com o tempo', () => {
    const world = createWorld(CONFIG, 7);
    const initial = world.store(Plant).size;
    const scheduler = new SystemScheduler().add(plantGrowthSystem).add(plantSpreadSystem);
    for (let i = 0; i < 3000; i++) {
      scheduler.update(world, 1 / 20);
    }
    expect(world.store(Plant).size).toBeGreaterThan(initial);
  });
});

describe('determinismo do mundo', () => {
  it('a mesma seed produz o mesmo estado após N ticks', () => {
    expect(snapshot(2024, 400)).toEqual(snapshot(2024, 400));
  });
});
