import { Texture } from 'pixi.js';

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** Escurece/clareia uma cor RGB por um fator (>1 clareia, <1 escurece). */
export function shade(rgb: number, factor: number): number {
  const r = clamp255(((rgb >> 16) & 255) * factor);
  const g = clamp255(((rgb >> 8) & 255) * factor);
  const b = clamp255((rgb & 255) * factor);
  return (r << 16) | (g << 8) | b;
}

/** Mistura duas cores RGB (t=0 → a, t=1 → b). */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = clamp255(ar + (br - ar) * t);
  const g = clamp255(ag + (bg - ag) * t);
  const bl = clamp255(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/**
 * Grade de pixels RGBA que vira uma `Texture` do Pixi com filtro *nearest*
 * (pixels nítidos, sem borrão) — a base de todo o pixel art procedural.
 */
export class PixelBuffer {
  private readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  set(x: number, y: number, rgb: number, alpha = 255): void {
    const px = x | 0;
    const py = y | 0;
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const i = (py * this.width + px) * 4;
    this.data[i] = (rgb >> 16) & 255;
    this.data[i + 1] = (rgb >> 8) & 255;
    this.data[i + 2] = rgb & 255;
    this.data[i + 3] = alpha;
  }

  rect(x: number, y: number, w: number, h: number, rgb: number, alpha = 255): void {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        this.set(x + i, y + j, rgb, alpha);
      }
    }
  }

  /** Disco preenchido de raio `r` centrado em (cx, cy). */
  disc(cx: number, cy: number, r: number, rgb: number, alpha = 255): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, rgb, alpha);
      }
    }
  }

  toTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PixelBuffer: contexto 2D indisponível.');
    const image = ctx.createImageData(this.width, this.height);
    image.data.set(this.data);
    ctx.putImageData(image, 0, 0);
    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'nearest';
    return texture;
  }
}
