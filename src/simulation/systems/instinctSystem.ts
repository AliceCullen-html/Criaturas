import { TAU, clamp } from '@core';
import { Transform, Velocity, type System } from '@engine';
import { Attributes, Creature, Mind, Needs, type Intent } from '@creatures';
import { TerrainResource, findNearestWater } from '@world';
import { FoodIndexResource } from '../foodIndex';

const THIRST_THRESHOLD = 0.6;
const HUNGER_THRESHOLD = 0.5;
const ENERGY_REST_THRESHOLD = 0.12;
const WANDER_MIN_DIST = 40;
const WANDER_MAX_DIST = 120;
const REACH_TARGET = 3;

const candidates: number[] = [];

/**
 * Proto-FSM de instinto: escolhe uma intenção (descansar / beber / comer /
 * vagar) conforme as necessidades e aponta a velocidade para o alvo. Será
 * substituído por uma State Machine formal na Etapa 4.
 */
export const instinctSystem: System = {
  name: 'instinct',
  update(world, dt) {
    const creatures = world.store(Creature);
    const transforms = world.store(Transform);
    const velocities = world.store(Velocity);
    const needsStore = world.store(Needs);
    const attributesStore = world.store(Attributes);
    const minds = world.store(Mind);
    const terrain = world.getResource(TerrainResource);
    const foodIndex = world.getResource(FoodIndexResource);
    const { rng, config } = world;

    creatures.forEach((_tag, entity) => {
      const transform = transforms.get(entity);
      const velocity = velocities.get(entity);
      const needs = needsStore.get(entity);
      const attributes = attributesStore.get(entity);
      const mind = minds.get(entity);
      if (!transform || !velocity || !needs || !attributes || !mind) return;

      let intent: Intent = 'wander';
      let targetX = transform.x;
      let targetY = transform.y;

      if (needs.energy < ENERGY_REST_THRESHOLD) {
        intent = 'rest';
      } else if (needs.thirst > THIRST_THRESHOLD) {
        const water = findNearestWater(terrain, transform.x, transform.y, attributes.vision);
        if (water) {
          intent = 'seekWater';
          targetX = water.x;
          targetY = water.y;
        }
      } else if (needs.hunger > HUNGER_THRESHOLD) {
        const plant = nearestPlant(
          foodIndex,
          transforms,
          transform.x,
          transform.y,
          attributes.vision,
        );
        if (plant >= 0) {
          const plantTransform = transforms.get(plant);
          if (plantTransform) {
            intent = 'seekFood';
            targetX = plantTransform.x;
            targetY = plantTransform.y;
          }
        }
      }

      if (intent === 'wander') {
        mind.retarget -= dt;
        const dx = mind.targetX - transform.x;
        const dy = mind.targetY - transform.y;
        if (mind.retarget <= 0 || dx * dx + dy * dy < REACH_TARGET * REACH_TARGET) {
          const angle = rng.range(0, TAU);
          const dist = rng.range(WANDER_MIN_DIST, WANDER_MAX_DIST);
          mind.targetX = clamp(transform.x + Math.cos(angle) * dist, 0, config.width);
          mind.targetY = clamp(transform.y + Math.sin(angle) * dist, 0, config.height);
          mind.retarget = rng.range(2, 5);
        }
        targetX = mind.targetX;
        targetY = mind.targetY;
      }

      mind.intent = intent;

      if (intent === 'rest') {
        velocity.x = 0;
        velocity.y = 0;
        return;
      }

      const dx = targetX - transform.x;
      const dy = targetY - transform.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) {
        velocity.x = 0;
        velocity.y = 0;
      } else {
        const speed = attributes.speed * (needs.energy > 0.3 ? 1 : 0.5);
        velocity.x = (dx / len) * speed;
        velocity.y = (dy / len) * speed;
      }
    });
  },
};

function nearestPlant(
  foodIndex: { query(x: number, y: number, r: number, out: number[]): number[] },
  transforms: { get(id: number): { x: number; y: number } | undefined },
  x: number,
  y: number,
  vision: number,
): number {
  foodIndex.query(x, y, vision, candidates);
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const id = candidates[i]!;
    const transform = transforms.get(id);
    if (!transform) continue;
    const dist = (transform.x - x) * (transform.x - x) + (transform.y - y) * (transform.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}
