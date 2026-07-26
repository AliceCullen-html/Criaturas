import { SpatialHash } from '@core';
import { Transform, defineResource, type System } from '@engine';
import { Item, Plant } from '@world';

const FOOD_CELL_SIZE = 50;

/** Índice espacial das plantas, reconstruído a cada tick para buscas rápidas. */
export const FoodIndexResource = defineResource<SpatialHash>('FoodIndex');

export const foodIndexSystem: System = {
  name: 'food-index',
  update(world) {
    if (!world.hasResource(FoodIndexResource)) {
      world.setResource(
        FoodIndexResource,
        new SpatialHash(FOOD_CELL_SIZE, world.config.width, world.config.height),
      );
    }
    const index = world.getResource(FoodIndexResource);
    const transforms = world.store(Transform);

    index.clear();
    world.store(Plant).forEach((_plant, entity) => {
      const transform = transforms.get(entity);
      if (transform) index.insert(entity, transform.x, transform.y);
    });
    // Frutas caídas também são comida — inclusive as que o jogador largou.
    world.store(Item).forEach((item, entity) => {
      // Gravetos, pedrinhas e penas não são comida — e o que está escondido
      // atrás de uma pedra só entra aqui depois de alguém encontrar.
      if (item.kind !== 'fruit' || item.held || item.hidden) return;
      const transform = transforms.get(entity);
      if (transform) index.insert(entity, transform.x, transform.y);
    });
  },
};
