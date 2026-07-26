import { clamp, clamp01 } from '@core';
import { Sprite, Transform, type System } from '@engine';
import { Item, maxItems, loose, dropFruitNear, itemRadius } from '../items';
import { SceneryResource } from '../scenery';

const ROT_RATE = 0.009; // frutas duram bastante, mas não para sempre
const FRICTION = 3.2;
const REST_SPEED = 2;
const TREE_MIN_INTERVAL = 55;
const TREE_MAX_INTERVAL = 150;

const rotten: number[] = [];

/**
 * Vida dos objetos: árvores dão frutas, frutas caídas apodrecem e somem, e
 * objetos arremessados desaceleram até parar.
 */
export const itemSystem: System = {
  name: 'item',
  update(world, dt) {
    const items = world.store(Item);
    const transforms = world.store(Transform);
    const sprites = world.store(Sprite);
    const scenery = world.getResource(SceneryResource);
    const { rng, config } = world;

    // Árvores frutificando.
    const cap = maxItems(config);
    if (loose(world) < cap) {
      for (const piece of scenery) {
        if (piece.kind !== 'tree') continue;
        piece.fruitTimer -= dt;
        if (piece.fruitTimer <= 0) {
          piece.fruitTimer = rng.range(TREE_MIN_INTERVAL, TREE_MAX_INTERVAL);
          if (loose(world) < cap) dropFruitNear(world, piece.x, piece.y + 8, rng);
        }
      }
    }

    rotten.length = 0;

    items.forEach((item, entity) => {
      if (item.held) return;

      // Física de arremesso.
      if (item.vx !== 0 || item.vy !== 0) {
        const transform = transforms.get(entity);
        if (transform) {
          transform.prevX = transform.x;
          transform.prevY = transform.y;
          transform.x = clamp(transform.x + item.vx * dt, 3, config.width - 3);
          transform.y = clamp(transform.y + item.vy * dt, 3, config.height - 3);
        }
        const decay = Math.max(0, 1 - FRICTION * dt);
        item.vx *= decay;
        item.vy *= decay;
        if (Math.hypot(item.vx, item.vy) < REST_SPEED) {
          item.vx = 0;
          item.vy = 0;
        }
      }

      // Só frutas apodrecem; gravetos e pedrinhas ficam para sempre.
      if (item.kind === 'fruit') {
        item.freshness = clamp01(item.freshness - ROT_RATE * dt);
        const sprite = sprites.get(entity);
        if (sprite) sprite.radius = itemRadius(item);
        if (item.freshness <= 0) rotten.push(entity);
      }
    });

    for (let i = 0; i < rotten.length; i++) world.destroyEntity(rotten[i]!);
  },
};
