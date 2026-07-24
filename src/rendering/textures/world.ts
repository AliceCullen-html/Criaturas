import { createRng, type Rng } from '@core';
import type { Texture } from 'pixi.js';
import { PixelBuffer, mix, shade } from '../pixel/PixelBuffer';

const GRASS_BASE = 0x5c9e48;
const GRASS_DARK = 0x4e8c3f;
const GRASS_LIGHT = 0x69ac52;
const WATER_DEEP = 0x2f6aa0;
const WATER_MID = 0x3f83bd;
const WATER_LIGHT = 0x6fb0dd;
const SAND = 0xcdb789;

/** Tile de grama 32x32 com ruído, tufos e florzinhas ocasionais. */
export function makeGrassTexture(seed: number): Texture {
  const rng = createRng(seed);
  const size = 32;
  const buffer = new PixelBuffer(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = rng.next();
      buffer.set(x, y, r < 0.12 ? GRASS_DARK : r > 0.9 ? GRASS_LIGHT : GRASS_BASE);
    }
  }
  // Tufos de grama.
  for (let i = 0; i < 26; i++) {
    const x = rng.int(size);
    const y = rng.int(size);
    buffer.set(x, y, GRASS_LIGHT);
    buffer.set(x, y - 1, GRASS_LIGHT);
  }
  // Florzinhas.
  const flowerColors = [0xf3d06b, 0xe89ac0, 0xf0f0f5];
  for (let i = 0; i < 5; i++) {
    const x = rng.int(size);
    const y = rng.int(size);
    buffer.set(x, y, flowerColors[rng.int(flowerColors.length)]!);
  }
  return buffer.toTexture();
}

/** Quadros de água 16x16 animados (linhas de brilho que deslizam). */
export function makeWaterTextures(): Texture[] {
  const frames = 4;
  const size = 16;
  const out: Texture[] = [];
  for (let f = 0; f < frames; f++) {
    const buffer = new PixelBuffer(size, size);
    for (let y = 0; y < size; y++) {
      const base = y < 5 ? WATER_MID : WATER_DEEP;
      for (let x = 0; x < size; x++) buffer.set(x, y, base);
    }
    for (let x = 0; x < size; x++) {
      const wave = Math.sin((x + f * 4) * 0.6);
      const y = 4 + Math.round(wave * 1.5) + 4;
      buffer.set(x, y, WATER_LIGHT);
      if (wave > 0.6) buffer.set(x, y - 3, mix(WATER_MID, 0xffffff, 0.3));
    }
    out.push(buffer.toTexture());
  }
  return out;
}

/** Textura de borda de areia (praia) — usada nas margens dos lagos. */
export function makeSandTexture(seed: number): Texture {
  const rng = createRng(seed);
  const size = 16;
  const buffer = new PixelBuffer(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = rng.next();
      buffer.set(x, y, r < 0.2 ? shade(SAND, 0.9) : r > 0.85 ? mix(SAND, 0xffffff, 0.2) : SAND);
    }
  }
  return buffer.toTexture();
}

function bakeShadow(buffer: PixelBuffer, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) buffer.set(x, y, 0x1a1e12, 60);
    }
  }
}

/** Sprites de recurso (índice = variante): maçã, frutinhas, cogumelo, flor, broto, arbusto. */
export function makeResourceTextures(): Texture[] {
  const apple = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 4, 1.6);
    b.disc(8, 8, 4, shade(0xd6473f, 0.7));
    b.disc(8, 8, 3.4, 0xd6473f);
    b.disc(6.6, 6.6, 1.2, mix(0xd6473f, 0xffffff, 0.5));
    b.rect(8, 3, 1, 2, 0x6b4a2b);
    b.set(9, 3, 0x6ab04a);
    b.set(10, 3, 0x6ab04a);
    return b.toTexture();
  };
  const berries = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 4, 1.6);
    for (const [x, y] of [
      [6, 8],
      [10, 8],
      [8, 10],
    ] as const) {
      b.disc(x, y, 2, shade(0x5a6fc0, 0.7));
      b.disc(x, y, 1.4, 0x6f86d6);
      b.set(x - 1, y - 1, mix(0x6f86d6, 0xffffff, 0.5));
    }
    b.rect(8, 4, 1, 3, 0x4e7a3c);
    return b.toTexture();
  };
  const mushroom = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 4, 1.6);
    b.rect(7, 8, 2, 4, 0xe6dcc0);
    b.disc(8, 7, 4, shade(0xc85149, 0.75));
    for (let x = 4; x <= 12; x++) if (((x + 8) & 1) === 0) b.set(x, 8, 0xc85149);
    b.rect(4, 8, 9, 1, 0xc85149);
    b.set(6, 5, 0xf0e6d0);
    b.set(10, 6, 0xf0e6d0);
    return b.toTexture();
  };
  const flower = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 3, 1.4);
    b.rect(8, 8, 1, 5, 0x4e7a3c);
    b.set(7, 10, 0x4e7a3c);
    const petal = 0xe89ac0;
    for (const [x, y] of [
      [8, 5],
      [6, 7],
      [10, 7],
      [7, 9],
      [9, 9],
    ] as const)
      b.disc(x, y, 1.2, petal);
    b.disc(8, 7, 1, 0xf3d06b);
    return b.toTexture();
  };
  const sprout = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 3, 1.2);
    b.rect(8, 9, 1, 4, 0x4e7a3c);
    b.disc(6, 9, 1.6, 0x6fae52);
    b.disc(10, 9, 1.6, 0x6fae52);
    b.disc(8, 7, 1.4, 0x7cbf5c);
    return b.toTexture();
  };
  const bush = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 4.5, 1.8);
    b.disc(6, 9, 3.2, shade(0x4e8c3f, 0.85));
    b.disc(10, 9, 3.2, shade(0x4e8c3f, 0.85));
    b.disc(8, 8, 3.6, 0x59a049);
    for (const [x, y] of [
      [6, 9],
      [10, 8],
      [8, 11],
    ] as const)
      b.set(x, y, 0xd6473f);
    return b.toTexture();
  };
  return [apple(), berries(), mushroom(), flower(), sprout(), bush()];
}

export interface SceneryTextures {
  tree: Texture;
  rock: Texture;
  bush: Texture;
}

/** Cenário decorativo (não interativo): árvore, pedra, arbusto — com sombra. */
export function makeSceneryTextures(rng: Rng): SceneryTextures {
  const tree = (): Texture => {
    const b = new PixelBuffer(32, 40);
    bakeShadow(b, 16, 37, 9, 3);
    b.rect(14, 24, 4, 12, 0x6b4a2b);
    b.rect(14, 24, 1, 12, shade(0x6b4a2b, 1.2));
    const leaf = 0x4f9440;
    b.disc(16, 16, 10, shade(leaf, 0.85));
    b.disc(12, 14, 7, leaf);
    b.disc(20, 15, 7, leaf);
    b.disc(16, 11, 7, mix(leaf, 0xffffff, 0.12));
    for (let i = 0; i < 14; i++) b.set(6 + rng.int(20), 8 + rng.int(16), mix(leaf, 0xffffff, 0.25));
    return b.toTexture();
  };
  const rock = (): Texture => {
    const b = new PixelBuffer(20, 16);
    bakeShadow(b, 10, 13, 7, 2);
    b.disc(10, 9, 6, shade(0x8b8f99, 0.8));
    b.disc(9, 8, 5, 0x9aa0ab);
    b.disc(7, 6, 2, mix(0x9aa0ab, 0xffffff, 0.35));
    return b.toTexture();
  };
  const bush = (): Texture => {
    const b = new PixelBuffer(20, 16);
    bakeShadow(b, 10, 13, 7, 2);
    b.disc(7, 9, 4, shade(0x4e8c3f, 0.85));
    b.disc(13, 9, 4, shade(0x4e8c3f, 0.85));
    b.disc(10, 7, 4.5, 0x59a049);
    return b.toTexture();
  };
  return { tree: tree(), rock: rock(), bush: bush() };
}

/** Nuvenzinha de poeira dos passos. */
export function makeDustTexture(): Texture {
  const b = new PixelBuffer(8, 8);
  b.disc(4, 4, 2.6, 0xd8cdb4);
  b.disc(3, 3, 1.4, 0xefe6d2);
  return b.toTexture();
}

/** Pequenas folhas para as partículas. */
export function makeLeafTextures(): Texture[] {
  const colors = [0xd98a4a, 0xe0b048, 0xc86b3c, 0x8fae4a];
  return colors.map((color) => {
    const b = new PixelBuffer(6, 6);
    b.disc(3, 3, 2, color);
    b.set(3, 1, shade(color, 0.7));
    b.set(2, 2, mix(color, 0xffffff, 0.4));
    return b.toTexture();
  });
}
