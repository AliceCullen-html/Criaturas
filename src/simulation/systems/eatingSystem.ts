import { Transform, type System } from '@engine';
import { Attributes, Creature, Needs } from '@creatures';
import { Plant, radiusForBiomass } from '@world';
import { FoodIndexResource } from '../foodIndex';

const EAT_RATE = 3; // biomassa por segundo
const NUTRITION = 0.12; // fome reduzida por unidade de biomassa
const PLANT_MIN_BIOMASS = 0.4;

const candidates: number[] = [];
const eaten: number[] = [];

/** Criaturas com fome mordiscam plantas em contato; plantas esgotadas somem. */
export const eatingSystem: System = {
  name: 'eating',
  update(world, dt) {
    const creatures = world.store(Creature);
    const transforms = world.store(Transform);
    const needsStore = world.store(Needs);
    const attributesStore = world.store(Attributes);
    const plants = world.store(Plant);
    const foodIndex = world.getResource(FoodIndexResource);

    eaten.length = 0;

    creatures.forEach((_tag, entity) => {
      const needs = needsStore.get(entity);
      if (!needs || needs.hunger < 0.05) return;
      const transform = transforms.get(entity);
      const attributes = attributesStore.get(entity);
      if (!transform || !attributes) return;

      const reach = attributes.size + 8;
      foodIndex.query(transform.x, transform.y, reach, candidates);

      for (let i = 0; i < candidates.length; i++) {
        const plantId = candidates[i]!;
        const plant = plants.get(plantId);
        const plantTransform = transforms.get(plantId);
        if (!plant || !plantTransform) continue;

        const dist = Math.hypot(plantTransform.x - transform.x, plantTransform.y - transform.y);
        if (dist > attributes.size + radiusForBiomass(plant.biomass)) continue;

        const bite = Math.min(EAT_RATE * dt, plant.biomass);
        plant.biomass -= bite;
        needs.hunger = Math.max(0, needs.hunger - bite * NUTRITION);
        if (plant.biomass <= PLANT_MIN_BIOMASS) eaten.push(plantId);
        break; // uma planta por tick
      }
    });

    for (let i = 0; i < eaten.length; i++) {
      world.destroyEntity(eaten[i]!);
    }
  },
};
