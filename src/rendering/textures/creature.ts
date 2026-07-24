import { createRng } from '@core';
import type { Texture } from 'pixi.js';
import { PixelBuffer, mix, shade } from '../pixel/PixelBuffer';

const SIZE = 24;
const CX = 12;
const CY = 13;
const RX = 7.5;
const RY = 8;

/** Índices iguais aos códigos de humor em `creatureRender.ts`. */
export type MoodIndex = 0 | 1 | 2 | 3 | 4 | 5;
export const MOOD_COUNT = 6;

/**
 * Gera o conjunto de sprites de uma criatura: um por expressão facial. O corpo
 * (cores, orelhas, antenas, rabo, manchas) vem do DNA — cada criatura é única;
 * o rosto muda conforme a emoção dominante.
 */
export function makeCreatureTextures(
  features: number,
  bodyColor: number,
  eyeColor: number,
): Texture[] {
  const out: Texture[] = [];
  for (let mood = 0; mood < MOOD_COUNT; mood++) {
    out.push(drawCreature(features, bodyColor, eyeColor, mood as MoodIndex));
  }
  return out;
}

function drawCreature(
  features: number,
  bodyColor: number,
  eyeColor: number,
  mood: MoodIndex,
): Texture {
  const rng = createRng(features || 1);
  const buffer = new PixelBuffer(SIZE, SIZE);

  const outline = shade(bodyColor, 0.5);
  const belly = mix(bodyColor, 0xffffff, 0.32);
  const spot = shade(bodyColor, 0.78);
  const foot = shade(bodyColor, 0.68);

  const inside = (x: number, y: number): number => {
    const dx = (x - CX) / RX;
    const dy = (y - CY) / RY;
    return dx * dx + dy * dy;
  };

  const earType = features & 3;
  const hasTail = ((features >> 2) & 1) === 1;
  const spotCount = (features >> 3) & 3;
  const bellyLight = ((features >> 9) & 1) === 1;

  // Rabo — levantado quando feliz, caído quando triste/assustada.
  if (hasTail) {
    const tailY = mood === 1 ? 13 : mood === 2 || mood === 3 ? 19 : 16;
    buffer.disc(20, tailY, 2.2, outline);
    buffer.disc(20, tailY, 1.3, bodyColor);
  }

  // Corpo (triste/dormindo afundam levemente).
  const bodyDrop = mood === 3 ? 1 : mood === 4 ? 1 : 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const e = inside(x, y - bodyDrop);
      if (e <= 1) buffer.set(x, y, bodyColor);
      else if (e <= 1.32) buffer.set(x, y, outline);
    }
  }

  for (const fx of [9, 15]) {
    buffer.disc(fx, 21, 1.8, outline);
    buffer.disc(fx, 20.6, 1.2, foot);
  }

  if (bellyLight) {
    for (let y = 12; y < 21; y++) {
      for (let x = 7; x < 18; x++) {
        const dx = (x - CX) / 4.2;
        const dy = (y - 16) / 4.5;
        if (dx * dx + dy * dy <= 1) buffer.set(x, y, belly);
      }
    }
  }

  for (let i = 0; i < spotCount; i++) {
    const sx = 7 + rng.int(11);
    const sy = 8 + rng.int(9);
    if (inside(sx, sy) <= 0.7) buffer.disc(sx, sy, 1.3, spot);
  }

  if (earType === 2) {
    // Orelhas: em pé quando curiosa/feliz, abaixadas quando com medo.
    const earY = mood === 2 || mood === 3 ? 7 : 5;
    for (const ex of [8, 16]) {
      buffer.disc(ex, earY, 2, outline);
      buffer.disc(ex, earY, 1.1, bodyColor);
    }
  } else if (earType === 3) {
    const tip = mix(bodyColor, 0xffffff, 0.5);
    const droop = mood === 3 ? 2 : 0;
    for (const ax of [9, 15]) {
      buffer.rect(ax, 2 + droop, 1, 4, outline);
      buffer.set(ax, 1 + droop, tip);
    }
  }

  drawFace(buffer, mood, eyeColor, outline, bodyColor, bodyDrop);
  return buffer.toTexture();
}

function drawFace(
  buffer: PixelBuffer,
  mood: MoodIndex,
  eyeColor: number,
  outline: number,
  bodyColor: number,
  drop: number,
): void {
  const eyeY = 10 + drop;
  const mouthY = 16 + drop;
  const white = 0xfdfdff;
  const shine = mix(eyeColor, 0xffffff, 0.65);

  switch (mood) {
    case 1: // Feliz — olhos brilhando e sorriso.
      for (const ex of [8, 15]) {
        buffer.rect(ex, eyeY, 3, 3, white);
        buffer.rect(ex + 1, eyeY + 1, 1, 1, eyeColor);
        buffer.set(ex, eyeY, shine);
        buffer.set(ex + 2, eyeY, shine);
      }
      buffer.set(10, mouthY, outline);
      buffer.rect(11, mouthY + 1, 2, 1, outline);
      buffer.set(13, mouthY, outline);
      break;

    case 2: // Com medo — olhos arregalados, boca aberta.
      for (const ex of [7, 14]) {
        buffer.rect(ex, eyeY - 1, 4, 4, white);
        buffer.rect(ex + 1, eyeY, 2, 2, eyeColor);
      }
      buffer.rect(11, mouthY, 2, 2, shade(bodyColor, 0.35));
      break;

    case 3: // Triste — pálpebras caídas e boca para baixo.
      for (const ex of [8, 15]) {
        buffer.rect(ex, eyeY + 1, 3, 2, white);
        buffer.rect(ex + 1, eyeY + 1, 1, 1, eyeColor);
        buffer.rect(ex, eyeY, 3, 1, outline);
      }
      buffer.set(10, mouthY + 1, outline);
      buffer.rect(11, mouthY, 2, 1, outline);
      buffer.set(13, mouthY + 1, outline);
      break;

    case 4: // Dormindo — olhos fechados e boquinha.
      for (const ex of [8, 15]) buffer.rect(ex, eyeY + 1, 3, 1, outline);
      buffer.rect(11, mouthY, 2, 1, shade(bodyColor, 0.4));
      break;

    case 5: // Brava — sobrancelhas inclinadas.
      for (const [ex, dir] of [
        [8, 1],
        [15, -1],
      ] as const) {
        buffer.rect(ex, eyeY, 3, 3, white);
        buffer.rect(ex + 1, eyeY + 1, 1, 1, eyeColor);
        for (let i = 0; i < 3; i++) {
          buffer.set(ex + i, eyeY - 1 + (dir > 0 ? i : 2 - i) * 0.5, outline);
        }
      }
      buffer.rect(10, mouthY + 1, 4, 1, outline);
      break;

    default: // Neutra.
      for (const ex of [8, 15]) {
        buffer.rect(ex, eyeY, 3, 3, white);
        buffer.rect(ex + 1, eyeY + 1, 1, 1, eyeColor);
        buffer.set(ex + 1, eyeY, shine);
      }
      buffer.rect(11, mouthY, 2, 1, outline);
      break;
  }
}
