import { Sprite, type System } from '@engine';
import { Plant } from '../components';
import { radiusForBiomass } from '../plant';

/** Faz a biomassa das plantas crescer até o máximo e atualiza o raio visual. */
export const plantGrowthSystem: System = {
  name: 'plant-growth',
  update(world, dt) {
    const plants = world.store(Plant);
    const sprites = world.store(Sprite);

    plants.forEach((plant, entity) => {
      if (plant.biomass < plant.maxBiomass) {
        plant.biomass = Math.min(plant.maxBiomass, plant.biomass + plant.growthRate * dt);
        const sprite = sprites.get(entity);
        if (sprite) sprite.radius = radiusForBiomass(plant.biomass);
      }
    });
  },
};
