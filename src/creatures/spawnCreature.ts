import { Transform, Velocity, World } from '@engine';
import { Appearance, Attributes, Bio, Creature, Identity, Mind, Needs } from './components';
import { CREATURE_NAMES } from './names';

const BODY_COLORS: readonly number[] = [
  0xe0a3a3, 0xa3c6e0, 0xb9e0a3, 0xe0d3a3, 0xc9a3e0, 0xa3e0d0, 0xe0b8a3,
];
const EYE_COLOR = 0x1c1c28;

/** Registra os stores dos componentes de criatura (idempotente). */
export function registerCreatureComponents(world: World): void {
  world.register(Transform);
  world.register(Velocity);
  world.register(Creature);
  world.register(Needs);
  world.register(Bio);
  world.register(Attributes);
  world.register(Appearance);
  world.register(Identity);
  world.register(Mind);
}

/** Cria uma criatura em (x, y). Atributos derivados do RNG do mundo. */
export function spawnCreature(world: World, x: number, y: number): number {
  const { rng } = world;
  const entity = world.createEntity();

  world.store(Transform).set(entity, { x, y, prevX: x, prevY: y });
  world.store(Velocity).set(entity, { x: 0, y: 0 });
  world.store(Creature).set(entity, true);

  world.store(Needs).set(entity, {
    hunger: rng.range(0.1, 0.35),
    thirst: rng.range(0.1, 0.35),
    energy: rng.range(0.6, 1),
    health: 1,
    happiness: 0.7,
  });

  world.store(Bio).set(entity, {
    sex: rng.chance(0.5) ? 'M' : 'F',
    species: 'Norn',
    age: rng.range(0, 40),
    lifespan: rng.range(900, 1500),
  });

  world.store(Attributes).set(entity, {
    speed: rng.range(24, 46),
    vision: rng.range(90, 150),
    strength: rng.range(0.3, 0.8),
    fertility: rng.range(0.3, 0.9),
    size: rng.range(9, 14),
  });

  world.store(Appearance).set(entity, { bodyColor: rng.pick(BODY_COLORS), eyeColor: EYE_COLOR });
  world.store(Identity).set(entity, { name: rng.pick(CREATURE_NAMES) });
  world.store(Mind).set(entity, { intent: 'wander', targetX: x, targetY: y, retarget: 0 });

  return entity;
}
