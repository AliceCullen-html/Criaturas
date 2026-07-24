import { World, type WorldConfig } from '@engine';
import { createRng } from '@core';
import { Position, Velocity, Renderable } from '../components';

const DEMO_ENTITY_COUNT = 200;
const MIN_SPEED = 20;
const MAX_SPEED = 80;
const MIN_RADIUS = 3;
const MAX_RADIUS = 7;
const PALETTE: readonly number[] = [0x86c8a8, 0x8ab6d6, 0xd6b58a, 0xc98aa8, 0xa8b0d0];

/**
 * Mundo de demonstração da Etapa 1: entidades com posição/velocidade/aparência
 * aleatórias, tudo derivado do RNG semeado (portanto reprodutível).
 */
export function createDemoWorld(config: WorldConfig, seed: number): World {
  const world = new World(config, createRng(seed));
  const { rng } = world;

  const positions = world.register(Position);
  const velocities = world.register(Velocity);
  const renderables = world.register(Renderable);

  for (let i = 0; i < DEMO_ENTITY_COUNT; i++) {
    const entity = world.createEntity();

    const x = rng.range(0, config.width);
    const y = rng.range(0, config.height);
    positions.set(entity, { x, y, prevX: x, prevY: y });

    const angle = rng.range(0, Math.PI * 2);
    const speed = rng.range(MIN_SPEED, MAX_SPEED);
    velocities.set(entity, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });

    renderables.set(entity, {
      radius: rng.range(MIN_RADIUS, MAX_RADIUS),
      color: rng.pick(PALETTE),
    });
  }

  return world;
}
