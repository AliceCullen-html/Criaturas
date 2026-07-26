import { createRng } from '@core';
import type { Texture } from 'pixi.js';
import { PixelBuffer, mix, shade } from '../pixel/PixelBuffer';

/**
 * Detalhes do chão em pixel art. Cada tipo tem algumas variantes, para o
 * jardim não parecer feito de carimbos repetidos.
 */
const GRASS = 0x4f9440;
const GRASS_LIGHT = 0x6fbf5c;
const EARTH = 0x7a5c3c;
const STONE = 0x9aa0ab;

function grassTall(seed: number): Texture {
  const rng = createRng(seed + 11);
  const b = new PixelBuffer(12, 14);
  for (let i = 0; i < 6; i++) {
    const x = 1 + i * 2 + rng.int(2);
    const h = 7 + rng.int(6);
    const lean = rng.int(3) - 1;
    const color = rng.chance(0.4) ? GRASS_LIGHT : GRASS;
    for (let j = 0; j < h; j++) {
      b.set(x + Math.round((j / h) * lean), 13 - j, j > h - 3 ? mix(color, 0xffffff, 0.2) : color);
    }
  }
  return b.toTexture();
}

function grassLow(seed: number): Texture {
  const rng = createRng(seed + 23);
  const b = new PixelBuffer(10, 7);
  for (let i = 0; i < 5; i++) {
    const x = 1 + i * 2;
    const h = 2 + rng.int(3);
    for (let j = 0; j < h; j++) b.set(x, 6 - j, rng.chance(0.4) ? GRASS_LIGHT : GRASS);
  }
  return b.toTexture();
}

function flower(seed: number): Texture {
  const rng = createRng(seed + 37);
  const palettes = [0xf2c14e, 0xe98ab0, 0xf0f0f5, 0xa88ae0, 0xef6b6b];
  const petal = palettes[seed % palettes.length]!;
  const b = new PixelBuffer(9, 12);
  b.rect(4, 6, 1, 6, 0x4e7a3c);
  b.set(3, 9, 0x4e7a3c);
  b.set(5, 8, 0x4e7a3c);
  for (const [dx, dy] of [
    [0, -2],
    [-2, 0],
    [2, 0],
    [-1, 2],
    [1, 2],
  ] as const) {
    b.disc(4 + dx, 5 + dy, 1.5, petal);
  }
  b.disc(4, 5, 1.2, 0xf7e08a);
  b.set(3, 4, mix(petal, 0xffffff, 0.5));
  if (rng.chance(0.3)) b.set(6, 3, mix(petal, 0xffffff, 0.6));
  return b.toTexture();
}

function pebble(seed: number): Texture {
  const rng = createRng(seed + 53);
  const b = new PixelBuffer(8, 6);
  const tone = rng.chance(0.5) ? STONE : shade(STONE, 0.85);
  b.ellipse(4, 4, 2.6, 1.8, shade(tone, 0.75));
  b.ellipse(3.6, 3.4, 2.2, 1.4, tone);
  b.set(3, 3, mix(tone, 0xffffff, 0.4));
  return b.toTexture();
}

function root(seed: number): Texture {
  const rng = createRng(seed + 71);
  const b = new PixelBuffer(11, 6);
  let y = 3;
  for (let x = 0; x < 11; x++) {
    if (rng.chance(0.3)) y += rng.chance(0.5) ? 1 : -1;
    y = Math.max(1, Math.min(4, y));
    b.set(x, y, EARTH);
    b.set(x, y + 1, shade(EARTH, 0.8));
  }
  return b.toTexture();
}

function fallenLeaf(seed: number): Texture {
  const colors = [0xc8703c, 0xd9a13c, 0xa8552c, 0x8f9c3a];
  const color = colors[seed % colors.length]!;
  const b = new PixelBuffer(7, 5);
  b.ellipse(3.5, 2.5, 3, 1.6, color);
  b.ellipse(3.5, 2.5, 1.6, 0.8, mix(color, 0xffffff, 0.25));
  b.set(0, 3, shade(color, 0.7));
  return b.toTexture();
}

function log(seed: number): Texture {
  const rng = createRng(seed + 97);
  const b = new PixelBuffer(26, 12);
  const bark = 0x6b4a2b;
  b.ellipse(13, 7, 12, 3.6, shade(bark, 0.75));
  b.ellipse(13, 6, 12, 3.2, bark);
  // Anéis nas pontas.
  b.ellipse(2, 6, 1.8, 3, mix(bark, 0xd8b98a, 0.6));
  b.ellipse(24, 6, 1.6, 2.6, mix(bark, 0xd8b98a, 0.5));
  for (let i = 0; i < 8; i++) {
    b.set(6 + rng.int(15), 4 + rng.int(4), shade(bark, 0.8));
  }
  // Musgo por cima.
  for (let i = 0; i < 7; i++) b.set(5 + rng.int(17), 3 + rng.int(2), 0x5c8f4a);
  return b.toTexture();
}

function moss(seed: number): Texture {
  const rng = createRng(seed + 131);
  const b = new PixelBuffer(12, 8);
  for (let i = 0; i < 22; i++) {
    const x = rng.int(12);
    const y = rng.int(8);
    b.set(x, y, rng.chance(0.5) ? 0x5c8f4a : 0x6da45a, 210);
  }
  return b.toTexture();
}

function lilyPad(seed: number): Texture {
  const rng = createRng(seed + 149);
  const b = new PixelBuffer(14, 11);
  const pad = 0x4f9455;
  b.ellipse(7, 6, 6, 4.4, shade(pad, 0.8));
  b.ellipse(7, 5.4, 5.4, 3.9, pad);
  b.ellipse(5, 4, 2, 1.2, mix(pad, 0xffffff, 0.22));
  // Fenda característica.
  for (let i = 0; i < 4; i++) b.set(7 + i, 6 + Math.round(i * 0.6), 0x2f6aa0);
  if (rng.chance(0.35)) {
    b.disc(9, 3, 1.6, 0xf2e2f0);
    b.disc(9, 3, 0.9, 0xf7d86a);
  }
  return b.toTexture();
}

function reed(seed: number): Texture {
  const rng = createRng(seed + 167);
  const b = new PixelBuffer(11, 18);
  for (let i = 0; i < 4; i++) {
    const x = 2 + i * 2 + rng.int(2);
    const h = 11 + rng.int(6);
    for (let j = 0; j < h; j++) b.set(x, 17 - j, j > h - 4 ? 0x6fae52 : 0x4e8c3f);
    if (rng.chance(0.5)) {
      // Espiga marrom no topo.
      b.ellipse(x, 17 - h - 1, 1.2, 2.2, 0x8a6a3c);
    }
  }
  return b.toTexture();
}

function shell(seed: number): Texture {
  const colors = [0xf0dcc8, 0xe8c8d0, 0xdcd0e8];
  const color = colors[seed % colors.length]!;
  const b = new PixelBuffer(8, 7);
  b.ellipse(4, 4.5, 3, 2.4, shade(color, 0.8));
  b.ellipse(4, 4, 2.6, 2, color);
  for (let i = -2; i <= 2; i++) b.set(4 + i, 4 - Math.abs(i) * 0.5, shade(color, 0.85));
  return b.toTexture();
}

/** Índice = PROP.kind; cada entrada tem algumas variantes. */
export function makePropTextures(): Texture[][] {
  const variants = <T>(count: number, make: (seed: number) => T): T[] =>
    Array.from({ length: count }, (_, i) => make(i));

  return [
    variants(3, grassTall),
    variants(3, grassLow),
    variants(5, flower),
    variants(3, pebble),
    variants(2, root),
    variants(4, fallenLeaf),
    variants(2, log),
    variants(2, moss),
    variants(4, lilyPad),
    variants(2, reed),
    variants(3, shell),
  ];
}
