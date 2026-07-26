import { describe, it, expect } from 'vitest';
import { Transform, Velocity } from '@engine';
import { createWorld, TerrainResource, isWaterAt } from '@world';
import { movementSystem } from './systems/movementSystem';

const CONFIG = { width: 1000, height: 1000 };

function makeWorld() {
  const world = createWorld(CONFIG, 5);
  world.register(Velocity);
  return world;
}

/** Acha um ponto de água e um ponto de terra vizinho a ele. */
function findShore(world: ReturnType<typeof makeWorld>): { landX: number; landY: number } | null {
  const terrain = world.getResource(TerrainResource);
  for (let y = 20; y < CONFIG.height - 20; y += 5) {
    for (let x = 20; x < CONFIG.width - 20; x += 5) {
      if (!isWaterAt(terrain, x, y) && isWaterAt(terrain, x + 12, y)) {
        return { landX: x, landY: y };
      }
    }
  }
  return null;
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

  it('não deixa a criatura entrar na água', () => {
    const world = makeWorld();
    const shore = findShore(world);
    expect(shore).not.toBeNull();

    const entity = world.createEntity();
    world.store(Transform).set(entity, {
      x: shore!.landX,
      y: shore!.landY,
      prevX: shore!.landX,
      prevY: shore!.landY,
    });
    // Empurra com força na direção do lago por vários passos.
    world.store(Velocity).set(entity, { x: 120, y: 0 });
    for (let i = 0; i < 40; i++) movementSystem.update(world, 1 / 20);

    const transform = world.store(Transform).get(entity)!;
    const terrain = world.getResource(TerrainResource);
    expect(isWaterAt(terrain, transform.x, transform.y)).toBe(false);
  });

  it('desliza pela margem em vez de travar', () => {
    const world = makeWorld();
    const shore = findShore(world);
    const entity = world.createEntity();
    world.store(Transform).set(entity, {
      x: shore!.landX,
      y: shore!.landY,
      prevX: shore!.landX,
      prevY: shore!.landY,
    });
    // Diagonal contra a água: o eixo livre (Y) deve continuar avançando.
    world.store(Velocity).set(entity, { x: 120, y: 60 });
    const startY = shore!.landY;
    for (let i = 0; i < 20; i++) movementSystem.update(world, 1 / 20);

    expect(world.store(Transform).get(entity)!.y).toBeGreaterThan(startY);
  });
});
