import { describe, it, expect } from 'vitest';
import { SystemScheduler, Transform, type Entity } from '@engine';
import { Bio, Creature, Needs } from '@creatures';
import { createWorld, plantGrowthSystem, plantSpreadSystem } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { foodIndexSystem } from './foodIndex';
import { instinctSystem } from './systems/instinctSystem';
import { movementSystem } from './systems/movementSystem';
import { eatingSystem } from './systems/eatingSystem';
import { metabolismSystem } from './systems/metabolismSystem';

const CONFIG = { width: 1000, height: 1000 };

function fullScheduler(): SystemScheduler {
  return new SystemScheduler()
    .add(foodIndexSystem)
    .add(instinctSystem)
    .add(movementSystem)
    .add(eatingSystem)
    .add(metabolismSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);
}

function firstCreature(world: ReturnType<typeof createWorld>): Entity {
  let found = -1;
  world.store(Creature).forEach((_tag, entity) => {
    if (found < 0) found = entity;
  });
  return found;
}

describe('metabolismSystem', () => {
  it('envelhece a criatura e aumenta a fome com o tempo', () => {
    const world = createWorld(CONFIG, 3);
    spawnCreatures(world, 5);
    const id = firstCreature(world);
    const before = { ...world.store(Needs).get(id)! };
    const ageBefore = world.store(Bio).get(id)!.age;

    const scheduler = new SystemScheduler().add(metabolismSystem);
    for (let i = 0; i < 200; i++) scheduler.update(world, 1 / 20);

    expect(world.store(Bio).get(id)!.age).toBeGreaterThan(ageBefore);
    expect(world.store(Needs).get(id)!.hunger).toBeGreaterThan(before.hunger);
  });
});

describe('determinismo das criaturas', () => {
  it('a mesma seed produz as mesmas posições após N ticks', () => {
    const run = (): number[] => {
      const world = createWorld(CONFIG, 99);
      spawnCreatures(world, 8);
      const scheduler = fullScheduler();
      for (let i = 0; i < 300; i++) scheduler.update(world, 1 / 20);

      const positions: number[] = [];
      world.store(Creature).forEach((_tag, entity) => {
        const transform = world.store(Transform).get(entity)!;
        positions.push(Math.round(transform.x), Math.round(transform.y));
      });
      return positions;
    };

    expect(run()).toEqual(run());
  });
});
