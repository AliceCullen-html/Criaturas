import { TAU, clamp01, subjects } from '@core';
import { Transform, type World } from '@engine';
import { Creature, Emotions, Memory, Mind } from '@creatures';
import {
  AMBIENT_BUTTERFLY,
  AmbientResource,
  Item,
  MAX_ITEMS,
  PropsResource,
  SceneryResource,
  dropFruitNear,
  swayPropsNear,
} from '@world';

/**
 * O que acontece quando o jogador mexe no cenário. Toda ação tem consequência
 * natural: o que cai, o que voa, o que assusta — e quem fica curioso.
 */

/** Faz as criaturas próximas ficarem curiosas com o que aconteceu ali. */
function drawAttention(world: World, x: number, y: number, radius: number, strength = 1): void {
  const transforms = world.store(Transform);
  const minds = world.store(Mind);
  const emotions = world.store(Emotions);

  world.store(Creature).forEach((_tag, entity) => {
    const transform = transforms.get(entity);
    const mind = minds.get(entity);
    const feel = emotions.get(entity);
    if (!transform || !mind || !feel) return;
    const distance = Math.hypot(transform.x - x, transform.y - y);
    if (distance > radius) return;

    // Quanto mais curiosa, mais forte a atração pelo acontecimento.
    const pull = (1 - distance / radius) * strength;
    feel.curiosity = clamp01(feel.curiosity + 0.35 * pull);
    mind.attention = Math.max(mind.attention, 2.5 * pull);
    mind.targetX = x;
    mind.targetY = y;
    mind.commitment = 0;
  });
}

/** Espanta os bichinhos de ambiente que estiverem perto. */
function scatterAmbient(world: World, x: number, y: number, radius: number): void {
  const beings = world.getResource(AmbientResource);
  for (const being of beings) {
    const dx = being.x - x;
    const dy = being.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) continue;
    const len = distance || 1;
    being.resting = 0;
    being.targetX = being.x + (dx / len) * 90;
    being.targetY = being.y + (dy / len) * 90;
  }
}

export interface PokeResult {
  kind: 'tree' | 'rock' | 'bush' | 'flower' | 'water' | 'none';
  x: number;
  y: number;
}

/**
 * Sacudir uma árvore: caem frutas e folhas, os insetos se espalham e as
 * criaturas curiosas vêm ver o que foi aquilo.
 */
export function shakeTree(world: World, index: number): PokeResult {
  const scenery = world.getResource(SceneryResource);
  const piece = scenery[index];
  if (!piece) return { kind: 'none', x: 0, y: 0 };

  const items = world.store(Item);
  const drops = 1 + world.rng.int(2);
  for (let i = 0; i < drops && items.size < MAX_ITEMS; i++) {
    dropFruitNear(world, piece.x, piece.y + 10, world.rng);
  }

  swayPropsNear(world.getResource(PropsResource), piece.x, piece.y, 40);
  scatterAmbient(world, piece.x, piece.y - 10, 70);
  drawAttention(world, piece.x, piece.y + 12, 200);

  return { kind: 'tree', x: piece.x, y: piece.y };
}

/**
 * Mexer numa pedra: aparecem os bichinhos que estavam escondidos embaixo, e
 * as curiosas vêm investigar.
 */
export function turnRock(world: World, index: number): PokeResult {
  const scenery = world.getResource(SceneryResource);
  const piece = scenery[index];
  if (!piece) return { kind: 'none', x: 0, y: 0 };

  // Bichinhos escondidos saem correndo de baixo da pedra.
  const beings = world.getResource(AmbientResource);
  let released = 0;
  for (const being of beings) {
    if (released >= 3) break;
    if (being.kind !== AMBIENT_BUTTERFLY) continue;
    const distance = Math.hypot(being.x - piece.x, being.y - piece.y);
    if (distance < 260) continue; // só traz os que estão longe, para "surgirem" ali
    const angle = world.rng.range(0, TAU);
    being.x = piece.x + Math.cos(angle) * 6;
    being.y = piece.y + Math.sin(angle) * 6;
    being.resting = 0;
    being.targetX = being.x + Math.cos(angle) * 80;
    being.targetY = being.y + Math.sin(angle) * 80;
    released += 1;
  }

  swayPropsNear(world.getResource(PropsResource), piece.x, piece.y, 26);
  drawAttention(world, piece.x, piece.y, 170);
  return { kind: 'rock', x: piece.x, y: piece.y };
}

/** Cutucar a vegetação: ela balança, e as borboletas por perto se assustam. */
export function pokeProps(world: World, x: number, y: number): PokeResult {
  const touched = swayPropsNear(world.getResource(PropsResource), x, y, 26);
  if (touched === 0) return { kind: 'none', x, y };
  scatterAmbient(world, x, y, 34);
  drawAttention(world, x, y, 90, 0.5);
  return { kind: 'flower', x, y };
}

/** Tocar a água: ondas se abrem e os peixes fogem. */
export function touchWater(world: World, x: number, y: number): PokeResult {
  scatterAmbient(world, x, y, 90);
  swayPropsNear(world.getResource(PropsResource), x, y, 30);
  drawAttention(world, x, y, 130, 0.7);
  return { kind: 'water', x, y };
}

/**
 * Marca o lugar como agradável quando o jogador enfeita a área. Criaturas
 * passam a frequentar onde há coisas boas — a memória de lugar já existia.
 */
export function rememberPleasantPlace(world: World, x: number, y: number, radius: number): void {
  const transforms = world.store(Transform);
  world.store(Memory).forEach((memory, entity) => {
    const transform = transforms.get(entity);
    if (!transform) return;
    if (Math.hypot(transform.x - x, transform.y - y) > radius) return;
    memory.record(subjects.place(x, y), 0.5, 0.2);
  });
}
