import { clamp01 } from '@core';
import { Transform, Velocity, type System } from '@engine';
import { Bio, Creature, Needs } from '@creatures';
import { TerrainResource, findNearestWater } from '@world';

const HUNGER_RATE = 0.012; // por segundo
const THIRST_RATE = 0.016;
const DRINK_RATE = 0.25;
const MOVE_DRAIN = 0.01;
const REST_RECOVER = 0.05;
const HEALTH_DRAIN = 0.05;
const HEALTH_REGEN = 0.02;
const DRINK_REACH = 22;

const deaths: number[] = [];

/**
 * Passagem do tempo: fome/sede sobem, energia gasta ao mover e recupera em
 * repouso, envelhecimento, saúde e felicidade. Morte por saúde zerada ou idade.
 */
export const metabolismSystem: System = {
  name: 'metabolism',
  update(world, dt) {
    const creatures = world.store(Creature);
    const needsStore = world.store(Needs);
    const bioStore = world.store(Bio);
    const transforms = world.store(Transform);
    const velocities = world.store(Velocity);
    const terrain = world.getResource(TerrainResource);

    deaths.length = 0;

    creatures.forEach((_tag, entity) => {
      const needs = needsStore.get(entity);
      const bio = bioStore.get(entity);
      if (!needs || !bio) return;

      needs.hunger = clamp01(needs.hunger + HUNGER_RATE * dt);
      needs.thirst = clamp01(needs.thirst + THIRST_RATE * dt);

      const transform = transforms.get(entity);
      if (transform && findNearestWater(terrain, transform.x, transform.y, DRINK_REACH)) {
        needs.thirst = clamp01(needs.thirst - DRINK_RATE * dt);
      }

      const velocity = velocities.get(entity);
      const moving = velocity ? velocity.x !== 0 || velocity.y !== 0 : false;
      needs.energy = clamp01(needs.energy + (moving ? -MOVE_DRAIN : REST_RECOVER) * dt);

      bio.age += dt;

      if (needs.hunger >= 1 || needs.thirst >= 1) {
        needs.health = clamp01(needs.health - HEALTH_DRAIN * dt);
      } else if (needs.hunger < 0.7 && needs.thirst < 0.7 && needs.energy > 0.2) {
        needs.health = clamp01(needs.health + HEALTH_REGEN * dt);
      }

      needs.happiness = clamp01(
        (needs.energy + (1 - needs.hunger) + (1 - needs.thirst) + needs.health) / 4,
      );

      if (needs.health <= 0 || bio.age >= bio.lifespan) deaths.push(entity);
    });

    for (let i = 0; i < deaths.length; i++) {
      world.destroyEntity(deaths[i]!);
    }
  },
};
