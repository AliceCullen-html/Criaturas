import type { Texture } from 'pixi.js';
import { PixelBuffer, mix, shade } from '../pixel/PixelBuffer';

/**
 * Bichinhos de ambiente. Dois quadros cada (asas abertas / fechadas), o que
 * basta para dar a sensação de voo em pixel art.
 */
export function makeAmbientTextures(): Texture[][] {
  const butterfly = (open: boolean): Texture => {
    const b = new PixelBuffer(9, 9);
    const wing = 0xf0a0d0;
    const wingDark = shade(wing, 0.75);
    const spread = open ? 3 : 1.6;
    b.ellipse(4 - spread, 3.5, spread, 2.6, wing);
    b.ellipse(4 + spread, 3.5, spread, 2.6, wing);
    b.ellipse(4 - spread, 5.5, spread * 0.8, 1.8, wingDark);
    b.ellipse(4 + spread, 5.5, spread * 0.8, 1.8, wingDark);
    b.rect(4, 2, 1, 5, 0x3a2a3a);
    b.set(3, 1, 0x3a2a3a);
    b.set(5, 1, 0x3a2a3a);
    return b.toTexture();
  };

  const bee = (open: boolean): Texture => {
    const b = new PixelBuffer(8, 8);
    const body = 0xf0c84a;
    b.ellipse(4, 4.5, 2.4, 2, body);
    b.rect(3, 3, 1, 3, 0x2e2618);
    b.rect(5, 3, 1, 3, 0x2e2618);
    const wingY = open ? 2 : 2.8;
    b.ellipse(2.6, wingY, 1.8, 1.1, 0xdfeaf5, 190);
    b.ellipse(5.4, wingY, 1.8, 1.1, 0xdfeaf5, 190);
    return b.toTexture();
  };

  const bird = (up: boolean): Texture => {
    const b = new PixelBuffer(11, 9);
    const body = 0x6f9ad6;
    b.ellipse(5, 5, 3, 2.4, body);
    b.ellipse(7.6, 3.6, 1.8, 1.6, body);
    b.set(8.4, 3.2, 0x1c1c28);
    b.set(9.6, 4, 0xe0a04a);
    const wy = up ? 2 : 6;
    b.ellipse(4, wy, 2.8, 1.4, shade(body, 0.8));
    b.ellipse(2.2, 6.4, 2, 1.1, shade(body, 0.7));
    return b.toTexture();
  };

  const critter = (step: boolean): Texture => {
    const b = new PixelBuffer(10, 8);
    const fur = 0xb08a63;
    b.ellipse(5, 4.5, 3.4, 2.4, fur);
    b.ellipse(8, 3.6, 1.8, 1.6, fur);
    b.set(8.8, 3.2, 0x1c1c28);
    b.ellipse(1.6, 4, 1.8, 1.2, shade(fur, 0.85));
    const legY = step ? 6.6 : 6.2;
    b.set(4, legY, shade(fur, 0.7));
    b.set(6, step ? 6.2 : 6.6, shade(fur, 0.7));
    b.set(3, 2.4, mix(fur, 0xffffff, 0.3));
    return b.toTexture();
  };

  const fish = (flip: boolean): Texture => {
    const b = new PixelBuffer(10, 7);
    const body = 0xe0904a;
    b.ellipse(5, 3.5, 3.2, 1.9, body);
    b.ellipse(4, 3, 2, 1.2, mix(body, 0xffffff, 0.3));
    // Cauda batendo.
    const ty = flip ? 2.4 : 4.4;
    b.ellipse(1.4, ty, 1.6, 1.6, shade(body, 0.8));
    b.set(7.4, 3, 0x1c1c28);
    return b.toTexture();
  };

  const dragonfly = (open: boolean): Texture => {
    const b = new PixelBuffer(12, 8);
    const body = 0x54c2c8;
    b.rect(3, 4, 7, 1, body);
    b.ellipse(9.6, 4, 1.4, 1.3, body);
    b.set(10.4, 3.6, 0x1c1c28);
    const wy = open ? 2 : 3;
    b.ellipse(5, wy, 3, 1, 0xdff2f7, 170);
    b.ellipse(5, 8 - wy - 1, 3, 1, 0xdff2f7, 150);
    return b.toTexture();
  };

  return [
    [butterfly(true), butterfly(false)],
    [bee(true), bee(false)],
    [bird(true), bird(false)],
    [critter(true), critter(false)],
    [fish(true), fish(false)],
    [dragonfly(true), dragonfly(false)],
  ];
}

/** Gotas de chuva (dois comprimentos, para dar profundidade). */
export function makeRainTextures(): Texture[] {
  return [4, 6].map((len) => {
    const b = new PixelBuffer(2, len + 1);
    for (let y = 0; y < len; y++) b.set(0, y, 0xb8d8f0, 150);
    b.set(0, len, 0xdff0ff, 200);
    return b.toTexture();
  });
}
