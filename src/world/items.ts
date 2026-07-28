import { TAU, clamp, type Rng } from '@core';
import { Sprite, Transform, defineComponent, type World, type WorldConfig } from '@engine';
import { isWaterAt } from './terrain';
import { TerrainResource } from './terrainResource';
import { countIn } from './density';
import { Ball } from './ball';

/**
 * Objeto físico do mundo: pode ser pego, arrastado, arremessado e — no caso
 * das frutas — comido. É por aqui que o jogador alimenta, em vez de um botão.
 */
export type ItemKind =
  | 'fruit'
  | 'toy'
  /** A bola que o jogador larga: rola, quica e é disputada. */
  | 'ball'
  /** Um presente: ursinho, flor, almofada, pedra bonita, pena. */
  | 'gift'
  | 'stick'
  | 'seed'
  | 'feather'
  | 'stone'
  | 'shell'
  | 'boulder';

export interface Item {
  kind: ItemKind;
  variant: number;
  /** 1 = fresca, 0 = podre. Frutas apodrecem no chão. */
  freshness: number;
  toxic: boolean;
  /** Na mão do jogador — não sofre física nem é comida. */
  held: boolean;
  /**
   * Id da criatura que está carregando, ou -1. Diferente de `held`, que é a mão
   * do jogador: uma fruta na boca de alguém continua sendo do mundo, mas anda
   * junto com quem a pegou e ninguém mais pode comê-la.
   */
  carriedBy: number;
  /** Escondido atrás de uma pedra: ninguém acha sem procurar. */
  hidden: boolean;
  /** Altura na pilha (0 = no chão). Empilhar é só arrumar, não guardar. */
  stack: number;
  vx: number;
  vy: number;
}
export const Item = defineComponent<Item>('Item');

export const FRUIT_VARIANTS = [0, 1, 5] as const; // maçã, frutinhas, amora
export const TOXIC_FRUIT_VARIANT = 2; // cogumelo
const TOY_VARIANT = 3;

/** Variantes dos objetos soltos e das raridades (índice na folha de sprites). */
export const VARIANT = {
  stick: 6,
  seed: 7,
  feather: 8,
  stone: 9,
  shell: 10,
  goldenFruit: 11,
  glowMushroom: 12,
  shinyStone: 13,
  boulder: 14,
  // --- Desenhados à mão, vindos do atlas do cinto -----------------------
  ball: 15,
  bear: 16,
  giftFlower: 17,
  pillow: 18,
  shinyRock: 19,
  giftFeather: 20,
  // --- Os seis quadros da bola, na ordem da ficha ------------------------
  ballAir: 21,
  ballFall: 22,
  ballHit: 23,
  ballRise: 24,
  ballRoll1: 25,
  ballRoll2: 26,
} as const;

const TRINKET_VARIANT: Record<string, number> = {
  stick: VARIANT.stick,
  seed: VARIANT.seed,
  feather: VARIANT.feather,
  stone: VARIANT.stone,
  shell: VARIANT.shell,
};

/** Raridades: valem mais e brilham. */
export const isRare = (variant: number): boolean =>
  variant === VARIANT.goldenFruit ||
  variant === VARIANT.glowMushroom ||
  variant === VARIANT.shinyStone;

/** Teto de objetos soltos num mundo 1000×1000. */
const MAX_ITEMS_BASE = 70;

export const maxItems = (config: WorldConfig): number => countIn(MAX_ITEMS_BASE, config, 14);

/**
 * Quantos objetos contam para o teto.
 *
 * Pedra grande não conta: ela é cenário que por acaso se empurra, é permanente
 * e não apodrece. Deixá-la ocupando vaga fazia as árvores pararem de frutificar
 * — cinco pedras comiam um quinto da despensa do jardim.
 */
export function loose(world: World): number {
  let count = 0;
  world.store(Item).forEach((item) => {
    if (item.kind !== 'boulder') count += 1;
  });
  return count;
}

/** Altura máxima de uma pilha e o quanto cada nível sobe na tela. */
export const MAX_STACK = 3;
export const STACK_STEP = 3.5;

/**
 * Raio de uma pedra grande. É o que ela ocupa no chão — e, diferente de todo o
 * resto, o que as criaturas NÃO conseguem atravessar.
 */
export const BOULDER_RADIUS = 13;

/** Raio visual conforme o frescor (frutas murcham ao apodrecer). */
export const itemRadius = (item: Item): number =>
  item.kind === 'fruit' ? 4.5 + item.freshness * 3 : item.kind === 'boulder' ? BOULDER_RADIUS : 7;

/**
 * Pedra grande: pesada demais para ser arremessada e sólida demais para se
 * passar por ela. Empurrando várias, o jogador constrói parede — e é isso que
 * torna possível encurralar alguém num canto.
 */
export function spawnBoulder(world: World, x: number, y: number): number {
  const entity = world.createEntity();
  world.store(Transform).set(entity, { x, y, prevX: x, prevY: y });
  world.store(Item).set(entity, {
    kind: 'boulder',
    variant: VARIANT.boulder,
    freshness: 1,
    toxic: false,
    held: false,
    carriedBy: -1,
    hidden: false,
    stack: 0,
    vx: 0,
    vy: 0,
  });
  world
    .store(Sprite)
    .set(entity, { radius: BOULDER_RADIUS, color: 0x8d8f95, variant: VARIANT.boulder });
  return entity;
}

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
  // Uma em muitas frutas é dourada — a recompensa de quem fica olhando.
  const golden = !toxic && options.variant === undefined && rng.chance(0.04);
  const variant =
    options.variant ??
    (golden ? VARIANT.goldenFruit : toxic ? TOXIC_FRUIT_VARIANT : rng.pick(FRUIT_VARIANTS));
  const entity = world.createEntity();

  world.store(Transform).set(entity, { x, y, prevX: x, prevY: y });
  const item: Item = {
    kind: 'fruit',
    variant,
    freshness: options.freshness ?? 1,
    toxic,
    held: false,
    carriedBy: -1,
    hidden: false,
    stack: 0,
    vx: 0,
    vy: 0,
  };
  world.store(Item).set(entity, item);
  world.store(Sprite).set(entity, { radius: itemRadius(item), color: 0xffffff, variant });
  return entity;
}

/**
 * A BOLA.
 *
 * Um objeto como os outros — o mesmo corpo físico que já rola e desacelera —,
 * mas com um significado próprio: é a única coisa do jardim que não serve para
 * nada. Não se come, não se planta, não protege da chuva. Existe para ser
 * empurrada, e é isso que a torna interessante para uma criatura curiosa.
 */
export function spawnBall(world: World, x: number, y: number): number {
  const entity = world.createEntity();
  // Nasce na altura da sua mão, não um palmo acima do chão: a bola CAI, quica
  // quatro vezes e assenta. É a apresentação dela — antes de qualquer criatura
  // chegar perto, o jardim inteiro já viu que essa coisa aqui pula.
  world.register(Ball);
  world.store(Ball).set(entity, { z: 58, prevZ: 58, vz: 0, roll: 0, hit: 0 });
  world.store(Transform).set(entity, { x, y, prevX: x, prevY: y });
  const item: Item = {
    kind: 'ball',
    variant: VARIANT.ball,
    freshness: 1,
    toxic: false,
    held: false,
    carriedBy: -1,
    hidden: false,
    stack: 0,
    vx: 0,
    vy: 0,
  };
  world.store(Item).set(entity, item);
  world
    .store(Sprite)
    .set(entity, { radius: itemRadius(item), color: 0xffffff, variant: item.variant });
  return entity;
}

/** As coisas que se pode dar de presente, na ordem em que o atlas as desenhou. */
export const GIFTS: readonly number[] = [
  VARIANT.bear,
  VARIANT.giftFlower,
  VARIANT.pillow,
  VARIANT.shinyRock,
  VARIANT.giftFeather,
];

/**
 * UM PRESENTE.
 *
 * O que sai é sorteado, e é assim que nasce o gosto: uma criatura que encontrou
 * três flores e nunca guardou uma pedra vira a criatura que gosta de flores. O
 * jogo não escolhe isso por ela — o acaso oferece, e a memória decide.
 */
export function spawnGift(world: World, x: number, y: number, variant?: number): number {
  const entity = world.createEntity();
  world.store(Transform).set(entity, { x, y, prevX: x, prevY: y });
  const item: Item = {
    kind: 'gift',
    variant: variant ?? world.rng.pick(GIFTS),
    freshness: 1,
    toxic: false,
    held: false,
    carriedBy: -1,
    hidden: false,
    stack: 0,
    vx: 0,
    vy: 0,
  };
  world.store(Item).set(entity, item);
  world
    .store(Sprite)
    .set(entity, { radius: itemRadius(item), color: 0xffffff, variant: item.variant });
  return entity;
}

/** Objeto solto do cenário: graveto, semente, pena, pedrinha ou concha. */
export function spawnTrinket(
  world: World,
  kind: 'stick' | 'seed' | 'feather' | 'stone' | 'shell',
  x: number,
  y: number,
): number {
  const entity = world.createEntity();
  const variant = TRINKET_VARIANT[kind]!;
  world.store(Transform).set(entity, { x, y, prevX: x, prevY: y });
  const item: Item = {
    kind,
    variant,
    freshness: 1,
    toxic: false,
    held: false,
    carriedBy: -1,
    hidden: false,
    stack: 0,
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
    carriedBy: -1,
    hidden: false,
    stack: 0,
    vx: 0,
    vy: 0,
  };
  world.store(Item).set(entity, item);
  world
    .store(Sprite)
    .set(entity, { radius: itemRadius(item), color: 0xffffff, variant: TOY_VARIANT });
  return entity;
}

/**
 * Espalha uma fruta caída ao redor de um ponto (usado pelas árvores). Árvores
 * de beira de lago existem: a fruta procura chão antes de cair, senão ficaria
 * boiando onde ninguém alcança.
 */
export function dropFruitNear(world: World, x: number, y: number, rng: Rng): number {
  const terrain = world.getResource(TerrainResource);
  let fallX = x;
  let fallY = y;
  for (let i = 0; i < 8; i++) {
    const angle = rng.range(0, TAU);
    const distance = rng.range(6, 18);
    fallX = clamp(x + Math.cos(angle) * distance, 4, world.config.width - 4);
    fallY = clamp(y + Math.sin(angle) * distance, 4, world.config.height - 4);
    if (!isWaterAt(terrain, fallX, fallY)) break;
  }
  return spawnFruit(world, fallX, fallY);
}
