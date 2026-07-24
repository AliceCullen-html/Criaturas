import type { Texture } from 'pixi.js';
import { PixelBuffer } from '../pixel/PixelBuffer';

/** Sinais visuais que substituem texto e menus: o mundo se explica sozinho. */
export type FeedbackKind = 'heart' | 'drop' | 'star' | 'sleep' | 'anger' | 'question';

export function makeFeedbackTextures(): Record<FeedbackKind, Texture> {
  const heart = (): Texture => {
    const b = new PixelBuffer(9, 9);
    const c = 0xef6b8a;
    const l = 0xf9a5b8;
    b.disc(3, 3, 1.8, c);
    b.disc(6, 3, 1.8, c);
    for (let y = 3; y <= 7; y++) {
      const w = 4 - (y - 3);
      for (let x = 4 - w; x <= 4 + w; x++) b.set(x, y, c);
    }
    b.set(2, 2, l);
    return b.toTexture();
  };

  const drop = (): Texture => {
    const b = new PixelBuffer(7, 8);
    const c = 0x6fb6e8;
    b.disc(3, 5, 2.2, c);
    b.rect(3, 1, 1, 3, c);
    b.set(2, 4, 0xbfe2f7);
    return b.toTexture();
  };

  const star = (): Texture => {
    const b = new PixelBuffer(9, 9);
    const c = 0xf5d76e;
    b.rect(4, 0, 1, 9, c);
    b.rect(0, 4, 9, 1, c);
    b.rect(3, 3, 3, 3, c);
    b.set(2, 2, c);
    b.set(6, 2, c);
    b.set(2, 6, c);
    b.set(6, 6, c);
    b.set(4, 4, 0xfff2c4);
    return b.toTexture();
  };

  const sleep = (): Texture => {
    // "Z" de sono.
    const b = new PixelBuffer(7, 7);
    const c = 0xdfe4f2;
    b.rect(1, 1, 5, 1, c);
    b.set(4, 2, c);
    b.set(3, 3, c);
    b.set(2, 4, c);
    b.rect(1, 5, 5, 1, c);
    return b.toTexture();
  };

  const anger = (): Texture => {
    const b = new PixelBuffer(9, 9);
    const c = 0xe06060;
    b.rect(1, 3, 3, 1, c);
    b.rect(1, 1, 1, 3, c);
    b.rect(5, 5, 3, 1, c);
    b.rect(7, 5, 1, 3, c);
    return b.toTexture();
  };

  const question = (): Texture => {
    const b = new PixelBuffer(7, 9);
    const c = 0xe9e4d5;
    b.rect(1, 1, 4, 1, c);
    b.set(5, 2, c);
    b.set(4, 3, c);
    b.set(3, 4, c);
    b.set(3, 5, c);
    b.set(3, 7, c);
    return b.toTexture();
  };

  return {
    heart: heart(),
    drop: drop(),
    star: star(),
    sleep: sleep(),
    anger: anger(),
    question: question(),
  };
}
