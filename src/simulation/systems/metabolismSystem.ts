import { clamp01 } from '@core';
import { Transform, Velocity, type System } from '@engine';
import { Bio, Creature, Emotions, Mind, Needs } from '@creatures';
import { TerrainResource, findNearestWater } from '@world';

const HUNGER_RATE = 0.011;
const THIRST_RATE = 0.015;
const DRINK_RATE = 0.3;
const MOVE_DRAIN = 0.012;
const REST_RECOVER = 0.03;
const SLEEP_RECOVER = 0.09;
const HEALTH_DRAIN = 0.05;
const HEALTH_REGEN = 0.02;
const DRINK_REACH = 24;

const deaths: number[] = [];

/**
 * Passagem do tempo no corpo: fome/sede sobem conforme o metabolismo (genético),
 * energia gasta ao mover e recupera dormindo, envelhecimento e morte.
 */
export const metabolismSystem: System = {
  name: 'metabolism',
  update(world, dt) {
    const creatures = world.store(Creature);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const bioStore = world.store(Bio);
    const minds = world.store(Mind);
    const transforms = world.store(Transform);
    const velocities = world.store(Velocity);
    const terrain = world.getResource(TerrainResource);

    deaths.length = 0;

    creatures.forEach((_tag, entity) => {
      const needs = needsStore.get(entity);
      const bio = bioStore.get(entity);
      const emotions = emotionsStore.get(entity);
      const mind = minds.get(entity);
      if (!needs || !bio || !emotions || !mind) return;

      needs.hunger = clamp01(needs.hunger + HUNGER_RATE * bio.metabolism * dt);
      needs.thirst = clamp01(needs.thirst + THIRST_RATE * bio.metabolism * dt);

      const transform = transforms.get(entity);
      if (transform && findNearestWater(terrain, transform.x, transform.y, DRINK_REACH)) {
        needs.thirst = clamp01(needs.thirst - DRINK_RATE * dt);
      }

      const velocity = velocities.get(entity);
      const moving = velocity ? velocity.x !== 0 || velocity.y !== 0 : false;
      const sleeping = mind.intent === 'sleep';
      const energyDelta = sleeping ? SLEEP_RECOVER : moving ? -MOVE_DRAIN : REST_RECOVER;
      needs.energy = clamp01(needs.energy + energyDelta * dt);

      bio.age += dt;
      bio.matingCooldown = Math.max(0, bio.matingCooldown - dt);

      if (needs.hunger >= 1 || needs.thirst >= 1) {
        needs.health = clamp01(needs.health - HEALTH_DRAIN * dt);
        emotions.stress = clamp01(emotions.stress + 0.05 * dt);
      } else if (needs.hunger < 0.7 && needs.thirst < 0.7 && needs.energy > 0.2) {
        needs.health = clamp01(needs.health + HEALTH_REGEN * dt);
      }

      if (needs.health <= 0 || bio.age >= bio.lifespan) deaths.push(entity);
    });

    for (let i = 0; i < deaths.length; i++) world.destroyEntity(deaths[i]!);
  },
};
