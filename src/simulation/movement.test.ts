import { describe, it, expect } from 'vitest';
import { Transform, World } from '@engine';
import { createRng } from '@core';
import { movementSystem } from './systems/movementSystem';
import { Velocity } from './components';

function makeWorld() {
  const world = new World({ width: 100, height: 100 }, createRng(1));
  world.register(Transform);
  world.register(Velocity);
  return world;
}

describe('movementSystem', () => {
  it('integra a posição a partir da velocidade', () => {
    const world = makeWorld();
    const entity = world.createEntity();
    world.store(Transform).set(entity, { x: 10, y: 10, prevX: 10, prevY: 10 });
    world.store(Velocity).set(entity, { x: 5, y: 0 });

    movementSystem.update(world, 1);

    const transform = world.store(Transform).get(entity)!;
    expect(transform.x).toBeCloseTo(15);
    expect(transform.prevX).toBeCloseTo(10);
  });

  it('envolve nas bordas (toroidal) sem salto na interpolação', () => {
    const world = makeWorld();
    const entity = world.createEntity();
    world.store(Transform).set(entity, { x: 98, y: 0, prevX: 98, prevY: 0 });
    world.store(Velocity).set(entity, { x: 10, y: 0 });

    movementSystem.update(world, 1);

    const transform = world.store(Transform).get(entity)!;
    expect(transform.x).toBeCloseTo(8);
    // prev acompanha o wrap: a diferença x-prevX continua pequena.
    expect(Math.abs(transform.x - transform.prevX)).toBeLessThan(50);
  });
});
