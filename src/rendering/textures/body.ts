import { createRng } from '@core';
import type { Texture } from 'pixi.js';
import { PixelBuffer, mix, shade } from '../pixel/PixelBuffer';
import { shapeAt, type SpeciesShape } from './speciesShapes';

export const SPRITE_SIZE = 32;

/** Fase da vida: muda proporções, cores e postura. */
export type LifeStage = 0 | 1 | 2; // 0 filhote, 1 adulto, 2 idoso

export interface Proportions {
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
const BASE_PROPORTIONS: Record<LifeStage, Proportions> = {
  0: {
    headX: 16,
    headY: 13,
    headRx: 10,
    headRy: 9.2,
    bodyY: 25,
    bodyRx: 4.8,
    bodyRy: 4.2,
    footY: 29,
    lean: 0,
  },
  1: {
    headX: 16,
    headY: 13,
    headRx: 9,
    headRy: 8.4,
    bodyY: 24,
    bodyRx: 6.8,
    bodyRy: 5.4,
    footY: 29,
    lean: 0,
  },
  2: {
    headX: 16,
    headY: 13.5,
    headRx: 8.4,
    headRy: 7.9,
    bodyY: 24.5,
    bodyRx: 6.4,
    bodyRy: 5,
    footY: 29,
    lean: 1,
  },
};

/** Proporções finais = base da idade × ajuste da espécie. */
export function proportionsFor(stage: LifeStage, speciesIndex = 0): Proportions {
  const base = BASE_PROPORTIONS[stage];
  const shape = shapeAt(speciesIndex);
  return {
    ...base,
    headRx: base.headRx * shape.headScale,
    headRy: base.headRy * shape.headScale,
    bodyRx: base.bodyRx * shape.bodyScale,
    bodyRy: base.bodyRy * Math.min(1.15, shape.bodyScale),
  };
}

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

/** Traços individuais sorteados do DNA (a espécie garante alguns). */
export interface Features {
  ears: 0 | 1 | 2 | 3;
  antennae: boolean;
  horns: boolean;
  tail: boolean;
  bigTail: boolean;
  fins: boolean;
  leaf: boolean;
  fluffy: boolean;
  topknot: boolean;
  whiskers: boolean;
  freckles: boolean;
  spots: number;
  belly: boolean;
  cheeks: boolean;
}

export function decodeFeatures(dna: number, speciesIndex = 0): Features {
  const shape = shapeAt(speciesIndex);
  // Orelha caída é assinatura exclusiva do Orelhudo: as outras espécies
  // sorteiam apenas nenhuma/redonda/pontuda, para não virarem sósias.
  const dnaEars = (dna % 3) as 0 | 1 | 2;
  const horns = shape.horns || ((dna >> 3) & 1) === 1;
  return {
    // A espécie manda na orelha quando tem uma marca registrada.
    ears: shape.ears !== 0 ? shape.ears : dnaEars,
    antennae: shape.antennae || (!horns && ((dna >> 2) & 1) === 1),
    horns,
    tail: shape.bigTail || ((dna >> 4) & 1) === 1,
    bigTail: shape.bigTail,
    fins: shape.fins,
    leaf: shape.leaf,
    fluffy: shape.fluffy,
    topknot: !shape.leaf && ((dna >> 8) & 1) === 1,
    whiskers: ((dna >> 9) & 1) === 1,
    freckles: ((dna >> 7) & 1) === 1,
    spots: (dna >> 5) & 3,
    belly: ((dna >> 11) & 1) === 1,
    cheeks: ((dna >> 12) & 1) === 1,
  };
}

export interface BodyColors {
  body: number;
  accent: number;
}

/** Desenha o corpo (sem rosto) de uma criatura. */
export function makeBodyTexture(
  dna: number,
  colors: BodyColors,
  stage: LifeStage,
  speciesIndex: number,
): Texture {
  const rng = createRng((dna || 1) ^ 0x5bf03);
  const shape: SpeciesShape = shapeAt(speciesIndex);
  const features = decodeFeatures(dna, speciesIndex);
  const p = proportionsFor(stage, speciesIndex);

  // Idosos desbotam; noturnos são naturalmente mais escuros.
  let skin = colors.body;
  if (shape.darken > 0) skin = mix(skin, 0x2a2440, shape.darken);
  if (stage === 2) skin = mix(skin, 0x9a9a9a, 0.42);

  let accent = colors.accent;
  if (shape.darken > 0) accent = mix(accent, 0x3a3260, shape.darken * 0.7);
  if (stage === 2) accent = mix(accent, 0xa0a0a0, 0.42);

  const outline = shade(skin, 0.42);
  const underside = shade(skin, 0.88);
  const spotColor = mix(skin, accent, 0.75);

  const mask = new Mask();
  const buffer = new PixelBuffer(SPRITE_SIZE, SPRITE_SIZE);
  const lean = p.lean;

  // ---- Silhueta (atrás) -----------------------------------------------
  if (features.bigTail) {
    // Cauda volumosa em curva, marca dos Rabudos.
    for (let i = 0; i < 7; i++) {
      mask.ellipse(
        p.headX + p.bodyRx + 1.5 + i * 1.5,
        p.bodyY + 2 - i * 2.2,
        4 - i * 0.35,
        4 - i * 0.35,
      );
    }
  } else if (features.tail) {
    mask.ellipse(p.headX + p.bodyRx + 2, p.bodyY + 1, 2.6, 2.2);
    mask.rect(p.headX + p.bodyRx - 1, p.bodyY, 3, 2);
  }

  if (features.fins) {
    // Nadadeiras laterais.
    for (const dir of [-1, 1]) {
      // Nadadeira em leque, apontando para fora e para baixo.
      for (let i = 0; i < 4; i++) {
        mask.ellipse(
          p.headX + dir * (p.bodyRx + 1.5 + i * 1.5),
          p.bodyY + 2 + i * 1.1,
          2.6 - i * 0.35,
          2.2 - i * 0.3,
        );
      }
    }
  }

  mask.ellipse(p.headX, p.bodyY, p.bodyRx, p.bodyRy);
  mask.ellipse(p.headX + lean, p.headY, p.headRx, p.headRy);
  mask.ellipse(p.headX - p.bodyRx * 0.55, p.footY, 2.6, 1.9);
  mask.ellipse(p.headX + p.bodyRx * 0.55, p.footY, 2.6, 1.9);

  // Orelhas.
  if (features.ears === 1) {
    mask.ellipse(p.headX - p.headRx * 0.62 + lean, p.headY - p.headRy * 0.82, 3.2, 3);
    mask.ellipse(p.headX + p.headRx * 0.62 + lean, p.headY - p.headRy * 0.82, 3.2, 3);
  } else if (features.ears === 2) {
    for (const dir of [-1, 1]) {
      const bx = p.headX + dir * p.headRx * 0.55 + lean;
      for (let i = 0; i < 5; i++) {
        mask.ellipse(bx + dir * i * 0.5, p.headY - p.headRy * 0.7 - i, (4 - i * 0.7) / 2, 1);
      }
    }
  } else if (features.ears === 3) {
    // Orelhas enormes e caídas (Orelhudos).
    for (const dir of [-1, 1]) {
      const bx = p.headX + dir * (p.headRx * 1.05) + lean;
      mask.ellipse(bx + dir * 1.5, p.headY + 5, 3.4, 8.5);
      mask.ellipse(bx, p.headY - 3.5, 3, 4.5);
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

  // Pelagem felpuda: recorta bolinhas na borda para dar textura.
  if (features.fluffy) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      mask.ellipse(
        p.headX + Math.cos(angle) * p.headRx * 1.0 + lean,
        p.headY + Math.sin(angle) * p.headRy * 1.0,
        2.7,
        2.7,
      );
    }
  }

  // ---- Pintura --------------------------------------------------------
  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      if (mask.has(x, y)) {
        buffer.set(x, y, y > p.bodyY + 1 ? underside : skin);
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
    mix(skin, 0xffffff, 0.24),
  );

  // Barriga na cor secundária.
  if (features.belly) {
    for (let y = p.bodyY - p.bodyRy; y <= p.footY; y++) {
      for (let x = p.headX - p.bodyRx; x <= p.headX + p.bodyRx; x++) {
        const dx = (x - p.headX) / (p.bodyRx * 0.72);
        const dy = (y - (p.bodyY + 1)) / (p.bodyRy * 0.95);
        if (dx * dx + dy * dy <= 1 && mask.has(x, y)) buffer.set(x, y, accent);
      }
    }
  }

  // Manchas.
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

  // Interior das orelhas caídas, na cor secundária.
  if (features.ears === 3) {
    for (const dir of [-1, 1]) {
      const bx = p.headX + dir * (p.headRx * 1.05) + lean;
      buffer.ellipse(bx + dir * 1.5, p.headY + 5, 1.8, 6, accent);
    }
  }

  // Antenas com bolinha luminosa.
  if (features.antennae) {
    const tip = mix(accent, 0xffffff, 0.4);
    for (const dir of [-1, 1]) {
      const bx = Math.round(p.headX + dir * 3 + lean);
      for (let i = 0; i < 3; i++) {
        buffer.set(bx + dir * (i > 1 ? 1 : 0), p.headY - p.headRy - i, outline);
      }
      buffer.disc(bx + dir, p.headY - p.headRy - 4.2, 2.3, outline);
      buffer.disc(bx + dir, p.headY - p.headRy - 4.2, 1.6, tip);
      buffer.set(bx + dir - 1, p.headY - p.headRy - 4.8, mix(tip, 0xffffff, 0.7));
    }
  }

  // Folha brotando (Folhinhas).
  if (features.leaf) {
    const leafColor = 0x6fbf5c;
    const leafDark = shade(leafColor, 0.7);
    const bx = p.headX + lean;
    for (let i = 0; i < 4; i++) buffer.set(bx, p.headY - p.headRy - i, leafDark);
    buffer.ellipse(bx + 3.4, p.headY - p.headRy - 3.8, 3.8, 2.3, leafColor);
    buffer.ellipse(bx - 2.8, p.headY - p.headRy - 1.6, 3, 1.9, leafColor);
    buffer.ellipse(bx + 3.4, p.headY - p.headRy - 3.8, 2.2, 1.1, mix(leafColor, 0xffffff, 0.35));
    buffer.set(bx + 2, p.headY - p.headRy - 4.4, mix(leafColor, 0xffffff, 0.6));
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
