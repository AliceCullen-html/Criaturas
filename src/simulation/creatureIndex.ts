import { SpatialHash } from '@core';
import { Transform, defineResource, type System } from '@engine';
import { Creature } from '@creatures';

const CELL_SIZE = 80;

/** Índice espacial das criaturas, reconstruído a cada tick (percepção social). */
export const CreatureIndexResource = defineResource<SpatialHash>('CreatureIndex');

export const creatureIndexSystem: System = {
  name: 'creature-index',
  update(world) {
    if (!world.hasResource(CreatureIndexResource)) {
      world.setResource(
        CreatureIndexResource,
        new SpatialHash(CELL_SIZE, world.config.width, world.config.height),
      );
    }
    const index = world.getResource(CreatureIndexResource);
    const transforms = world.store(Transform);

    index.clear();
    world.store(Creature).forEach((_tag, entity) => {
      const transform = transforms.get(entity);
      if (transform) index.insert(entity, transform.x, transform.y);
    });
  },
};
