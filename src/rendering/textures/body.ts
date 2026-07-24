import { createRng } from '@core';
import type { Texture } from 'pixi.js';
import { PixelBuffer, mix, shade } from '../pixel/PixelBuffer';

export const SPRITE_SIZE = 32;

/** Fase da vida: muda proporções, cores e postura. */
export type LifeStage = 0 | 1 | 2; // 0 filhote, 1 adulto, 2 idoso

interface Proportions {
  headX: number;
  headY: number;
  headRx: number;
  headRy: number;
  bodyY: number;
  bodyRx: number;
  bodyRy: number;
  footY: number;
  lean: number;
}

/** Cabeça grande domina a silhueta; filhotes exageram ainda mais. */
const PROPORTIONS: Record<LifeStage, Proportions> = {
  // Cabeça quase redonda + corpo bem mais estreito = silhueta macia, com
  // uma cinturinha suave em vez de laterais retas.
  0: {
    headX: 16,
    headY: 11,
    headRx: 10,
    headRy: 9.4,
    bodyY: 23,
    bodyRx: 6,
    bodyRy: 5.4,
    footY: 27.5,
    lean: 0,
  },
  1: {
    headX: 16,
    headY: 11,
    headRx: 9.5,
    headRy: 9,
    bodyY: 22.5,
    bodyRx: 7,
    bodyRy: 5.8,
    footY: 27.5,
    lean: 0,
  },
  2: {
    headX: 16,
    headY: 11.5,
    headRx: 8.8,
    headRy: 8.3,
    bodyY: 23,
    bodyRx: 6.6,
    bodyRy: 5.4,
    footY: 27.5,
    lean: 1,
  },
};

export const proportionsFor = (stage: LifeStage): Proportions => PROPORTIONS[stage];

/** Silhueta em máscara booleana — permite um contorno único ao redor de tudo. */
class Mask {
  readonly data = new Uint8Array(SPRITE_SIZE * SPRITE_SIZE);

  add(x: number, y: number): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= SPRITE_SIZE || py >= SPRITE_SIZE) return;
    this.data[py * SPRITE_SIZE + px] = 1;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number): void {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.add(x, y);
      }
    }
  }

  rect(x: number, y: number, w: number, h: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.add(x + i, y + j);
  }

  has(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= SPRITE_SIZE || y >= SPRITE_SIZE) return false;
    return this.data[y * SPRITE_SIZE + x] === 1;
  }
}

/** Traços sorteados a partir do DNA. Nenhuma criatura sai igual à outra. */
export interface Features {
  ears: 0 | 1 | 2 | 3; // nenhuma, redondas, pontudas, caídas
  antennae: boolean;
  horns: boolean;
  tail: boolean;
  wings: boolean;
  topknot: boolean;
  whiskers: boolean;
  freckles: boolean;
  spots: number;
  belly: boolean;
  cheeks: boolean;
}

export function decodeFeatures(dna: number): Features {
  const ears = (dna & 3) as 0 | 1 | 2 | 3;
  const horns = ((dna >> 3) & 1) === 1;
  return {
    ears,
    // Antenas e chifres não convivem: evita silhuetas confusas.
    antennae: !horns && ((dna >> 2) & 1) === 1,
    horns,
    tail: ((dna >> 4) & 1) === 1,
    wings: ((dna >> 10) & 3) === 3,
    topknot: ((dna >> 8) & 1) === 1,
    whiskers: ((dna >> 9) & 1) === 1,
    freckles: ((dna >> 7) & 1) === 1,
    spots: (dna >> 5) & 3,
    belly: ((dna >> 11) & 1) === 1,
    cheeks: ((dna >> 12) & 1) === 1,
  };
}

/** Desenha o corpo (sem rosto) de uma criatura. */
export function makeBodyTexture(dna: number, bodyColor: number, stage: LifeStage): Texture {
  const rng = createRng((dna || 1) ^ 0x5bf03);
  const features = decodeFeatures(dna);
  const p = PROPORTIONS[stage];

  // Idosos desbotam: cor puxada para o cinza e um pouco mais clara.
  const skin = stage === 2 ? mix(bodyColor, 0x9a9a9a, 0.42) : bodyColor;
  const outline = shade(skin, 0.48);
  const bellyColor = mix(skin, 0xffffff, 0.34);
  const spotColor = shade(skin, 0.82);
  const underside = shade(skin, 0.9);

  const mask = new Mask();
  const buffer = new PixelBuffer(SPRITE_SIZE, SPRITE_SIZE);
  const lean = p.lean;

  // ---- Silhueta -------------------------------------------------------
  if (features.tail) {
    mask.ellipse(p.headX + p.bodyRx + 2, p.bodyY + 1, 2.6, 2.2);
    mask.rect(p.headX + p.bodyRx - 1, p.bodyY, 3, 2);
  }
  if (features.wings) {
    mask.ellipse(p.headX - p.bodyRx - 2.5, p.bodyY - 3, 3, 4);
    mask.ellipse(p.headX + p.bodyRx + 2.5, p.bodyY - 3, 3, 4);
  }
  mask.ellipse(p.headX, p.bodyY, p.bodyRx, p.bodyRy); // corpo
  mask.ellipse(p.headX + lean, p.headY, p.headRx, p.headRy); // cabeça
  // Pés
  mask.ellipse(p.headX - p.bodyRx * 0.55, p.footY, 2.6, 1.9);
  mask.ellipse(p.headX + p.bodyRx * 0.55, p.footY, 2.6, 1.9);

  if (features.ears === 1) {
    mask.ellipse(p.headX - p.headRx * 0.62 + lean, p.headY - p.headRy * 0.82, 3.2, 3);
    mask.ellipse(p.headX + p.headRx * 0.62 + lean, p.headY - p.headRy * 0.82, 3.2, 3);
  } else if (features.ears === 2) {
    for (const dir of [-1, 1]) {
      const bx = p.headX + dir * p.headRx * 0.55 + lean;
      for (let i = 0; i < 5; i++) {
        const w = 4 - i * 0.7;
        mask.ellipse(bx + dir * i * 0.5, p.headY - p.headRy * 0.7 - i, w / 2, 1);
      }
    }
  } else if (features.ears === 3) {
    for (const dir of [-1, 1]) {
      const bx = p.headX + dir * p.headRx * 0.85 + lean;
      mask.ellipse(bx, p.headY - 1, 2.4, 4.2);
    }
  }

  if (features.horns) {
    for (const dir of [-1, 1]) {
      const bx = p.headX + dir * p.headRx * 0.5 + lean;
      for (let i = 0; i < 4; i++) {
        mask.ellipse(bx + dir * i * 0.6, p.headY - p.headRy * 0.75 - i, 1.6 - i * 0.25, 1);
      }
    }
  }

  if (features.topknot) {
    mask.ellipse(p.headX + lean, p.headY - p.headRy - 1, 2.6, 2.4);
    mask.ellipse(p.headX + lean - 2, p.headY - p.headRy, 1.8, 1.8);
  }

  // ---- Pintura --------------------------------------------------------
  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      if (mask.has(x, y)) {
        // Leve sombreado embaixo dá volume macio.
        const belowMiddle = y > p.bodyY + 1;
        buffer.set(x, y, belowMiddle ? underside : skin);
      } else if (
        mask.has(x - 1, y) ||
        mask.has(x + 1, y) ||
        mask.has(x, y - 1) ||
        mask.has(x, y + 1)
      ) {
        buffer.set(x, y, outline);
      }
    }
  }

  // Brilho suave no topo da cabeça.
  buffer.ellipse(
    p.headX - p.headRx * 0.4 + lean,
    p.headY - p.headRy * 0.5,
    2.6,
    1.8,
    mix(skin, 0xffffff, 0.22),
  );

  // Barriga clara.
  if (features.belly) {
    for (let y = p.bodyY - p.bodyRy; y <= p.footY; y++) {
      for (let x = p.headX - p.bodyRx; x <= p.headX + p.bodyRx; x++) {
        const dx = (x - p.headX) / (p.bodyRx * 0.72);
        const dy = (y - (p.bodyY + 1)) / (p.bodyRy * 0.95);
        if (dx * dx + dy * dy <= 1 && mask.has(x, y)) buffer.set(x, y, bellyColor);
      }
    }
  }

  // Manchas espalhadas pelo corpo.
  for (let i = 0; i < features.spots; i++) {
    const sx = p.headX + rng.range(-p.headRx * 0.75, p.headRx * 0.75);
    const sy = p.headY + rng.range(-p.headRy * 0.5, p.headRy * 0.9);
    for (let y = Math.floor(sy - 2); y <= sy + 2; y++) {
      for (let x = Math.floor(sx - 2); x <= sx + 2; x++) {
        const dx = (x - sx) / 2.2;
        const dy = (y - sy) / 1.8;
        if (dx * dx + dy * dy <= 1 && mask.has(x, y)) buffer.set(x, y, spotColor);
      }
    }
  }

  // Antenas (finas, desenhadas por cima).
  if (features.antennae) {
    const tip = mix(skin, 0xffffff, 0.55);
    for (const dir of [-1, 1]) {
      const bx = Math.round(p.headX + dir * 3 + lean);
      for (let i = 0; i < 4; i++)
        buffer.set(bx + dir * (i > 2 ? 1 : 0), p.headY - p.headRy - i, outline);
      buffer.disc(bx + dir, p.headY - p.headRy - 4.5, 1.3, tip);
    }
  }

  // Fios brancos dos idosos.
  if (stage === 2) {
    const white = 0xf2f2f5;
    buffer.set(p.headX - 4 + lean, p.headY - p.headRy + 1, white);
    buffer.set(p.headX - 3 + lean, p.headY - p.headRy + 2, white);
    buffer.set(p.headX + 3 + lean, p.headY - p.headRy + 1, white);
    buffer.set(p.headX + 5 + lean, p.headY - p.headRy + 3, white);
  }

  return buffer.toTexture();
}
