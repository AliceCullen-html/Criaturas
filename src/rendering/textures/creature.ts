import { createRng } from '@core';
import type { Texture } from 'pixi.js';
import { PixelBuffer, mix, shade } from '../pixel/PixelBuffer';

const SIZE = 24;
const CX = 12;
const CY = 13;
const RX = 7.5;
const RY = 8;

/**
 * Gera um sprite de criatura 24x24 único a partir do DNA: corpo com contorno,
 * barriga, olhos, boca e — conforme bits do DNA — orelhas, antenas, rabo e
 * manchas. Desenhada de frente; o render espelha em X conforme a direção.
 */
export function makeCreatureTexture(dna: number, bodyColor: number, eyeColor: number): Texture {
  const rng = createRng(dna || 1);
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

  const earType = dna & 3; // 0/1 nada, 2 orelhas, 3 antenas
  const hasTail = ((dna >> 2) & 1) === 1;
  const spotCount = (dna >> 3) & 3;
  const bellyLight = ((dna >> 9) & 1) === 1;
  const mouthType = (dna >> 7) & 3;

  // Rabo (atrás do corpo).
  if (hasTail) {
    buffer.disc(20, 16, 2.2, outline);
    buffer.disc(20, 16, 1.3, bodyColor);
  }

  // Corpo + contorno.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const e = inside(x, y);
      if (e <= 1) buffer.set(x, y, bodyColor);
      else if (e <= 1.32) buffer.set(x, y, outline);
    }
  }

  // Pés.
  for (const fx of [9, 15]) {
    buffer.disc(fx, 21, 1.8, outline);
    buffer.disc(fx, 20.6, 1.2, foot);
  }

  // Barriga clara.
  if (bellyLight) {
    for (let y = 12; y < 21; y++) {
      for (let x = 7; x < 18; x++) {
        const dx = (x - CX) / 4.2;
        const dy = (y - 16) / 4.5;
        if (dx * dx + dy * dy <= 1) buffer.set(x, y, belly);
      }
    }
  }

  // Manchas.
  for (let i = 0; i < spotCount; i++) {
    const sx = 7 + rng.int(11);
    const sy = 8 + rng.int(9);
    if (inside(sx, sy) <= 0.7) buffer.disc(sx, sy, 1.3, spot);
  }

  // Orelhas / antenas.
  if (earType === 2) {
    for (const ex of [8, 16]) {
      buffer.disc(ex, 5, 2, outline);
      buffer.disc(ex, 5, 1.1, bodyColor);
    }
  } else if (earType === 3) {
    const tip = mix(bodyColor, 0xffffff, 0.5);
    for (const ax of [9, 15]) {
      buffer.rect(ax, 2, 1, 4, outline);
      buffer.set(ax, 1, tip);
    }
  }

  // Olhos.
  for (const ex of [8, 15]) {
    buffer.rect(ex, 10, 3, 3, 0xfdfdff);
    buffer.rect(ex + 1, 11, 1, 1, eyeColor);
    buffer.set(ex + 1, 10, mix(eyeColor, 0xffffff, 0.6));
  }

  // Boca.
  if (mouthType === 0) {
    buffer.rect(11, 16, 2, 1, outline);
  } else if (mouthType === 1) {
    buffer.set(10, 16, outline);
    buffer.rect(11, 17, 2, 1, outline);
    buffer.set(13, 16, outline);
  } else if (mouthType === 2) {
    buffer.rect(11, 16, 2, 2, shade(bodyColor, 0.4));
  } else {
    buffer.rect(10, 16, 4, 1, outline);
  }

  return buffer.toTexture();
}
