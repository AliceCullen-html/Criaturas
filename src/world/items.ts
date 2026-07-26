import { TAU, clamp, type Rng } from '@core';
import { Sprite, Transform, defineComponent, type World } from '@engine';

/**
 * Objeto físico do mundo: pode ser pego, arrastado, arremessado e — no caso
 * das frutas — comido. É por aqui que o jogador alimenta, em vez de um botão.
 */
export interface Item {
  kind: 'fruit' | 'toy';
  variant: number;
  /** 1 = fresca, 0 = podre. Frutas apodrecem no chão. */
  freshness: number;
  toxic: boolean;
  /** Na mão do jogador — não sofre física nem é comida. */
  held: boolean;
  vx: number;
  vy: number;
}
export const Item = defineComponent<Item>('Item');

export const FRUIT_VARIANTS = [0, 1, 5] as const; // maçã, frutinhas, amora
export const TOXIC_FRUIT_VARIANT = 2; // cogumelo
const TOY_VARIANT = 3;

export const MAX_ITEMS = 70;

/** Raio visual conforme o frescor (frutas murcham ao apodrecer). */
export const itemRadius = (item: Item): number =>
  item.kind === 'toy' ? 7 : 4.5 + item.freshness * 3;

export function registerItems(world: World): void {
  world.register(Item);
}

export function spawnFruit(
  world: World,
  x: number,
  y: number,
  options: { toxic?: boolean; variant?: number; freshness?: number } = {},
): number {
  const { rng } = world;
  const toxic = options.toxic ?? rng.chance(0.18);
  const variant = options.variant ?? (toxic ? TOXIC_FRUIT_VARIANT : rng.pick(FRUIT_VARIANTS));
  const entity = world.createEntity();

  world.store(Transform).set(entity, { x, y, prevX: x, prevY: y });
  const item: Item = {
    kind: 'fruit',
    variant,
    freshness: options.freshness ?? 1,
    toxic,
    held: false,
    vx: 0,
    vy: 0,
  };
  world.store(Item).set(entity, item);
  world.store(Sprite).set(entity, { radius: itemRadius(item), color: 0xffffff, variant });
  return entity;
}

export function spawnToy(world: World, x: number, y: number): number {
  const entity = world.createEntity();
  world.store(Transform).set(entity, { x, y, prevX: x, prevY: y });
  const item: Item = {
    kind: 'toy',
    variant: TOY_VARIANT,
    freshness: 1,
    toxic: false,
    held: false,
    vx: 0,
    vy: 0,
  };
  world.store(Item).set(entity, item);
  world
    .store(Sprite)
    .set(entity, { radius: itemRadius(item), color: 0xffffff, variant: TOY_VARIANT });
  return entity;
}

/** Espalha uma fruta caída ao redor de um ponto (usado pelas árvores). */
export function dropFruitNear(world: World, x: number, y: number, rng: Rng): number {
  const angle = rng.range(0, TAU);
  const distance = rng.range(6, 18);
  return spawnFruit(
    world,
    clamp(x + Math.cos(angle) * distance, 4, world.config.width - 4),
    clamp(y + Math.sin(angle) * distance, 4, world.config.height - 4),
  );
}
