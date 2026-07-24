import { describe, it, expect } from 'vitest';
import { SystemScheduler } from '@engine';
import { createDemoWorld } from './world/createDemoWorld';
import { movementSystem } from './systems/movementSystem';
import { Position } from './components';

function runSteps(seed: number, steps: number): number[] {
  const world = createDemoWorld({ width: 1000, height: 1000 }, seed);
  const scheduler = new SystemScheduler().add(movementSystem);
  for (let i = 0; i < steps; i++) {
    scheduler.update(world, 1 / 20);
  }

  const result: number[] = [];
  world.store(Position).forEach((position) => {
    result.push(position.x, position.y);
  });
  return result;
}

describe('determinismo da simulação', () => {
  it('a mesma seed produz o mesmo estado após N ticks', () => {
    expect(runSteps(2024, 200)).toEqual(runSteps(2024, 200));
  });

  it('seeds diferentes divergem', () => {
    expect(runSteps(1, 50)).not.toEqual(runSteps(2, 50));
  });
});
