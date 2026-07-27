import type { Texture } from 'pixi.js';
import { PixelBuffer, mix } from '../pixel/PixelBuffer';
import { SPRITE_SIZE, proportionsFor, type Features, type LifeStage } from './body';

/**
 * Rosto desenhado numa camada própria, sobreposta ao corpo. Trocar de emoção
 * troca só esta textura — o corpo (com suas cores, orelhas, manchas e chifres)
 * permanece intacto.
 */
export type Expression =
  | 'neutral'
  | 'happy'
  | 'needy'
  | 'sleepy'
  | 'surprised'
  | 'angry'
  | 'sad'
  | 'loved'
  | 'afraid'
  | 'curious'
  | 'hungry'
  | 'thirsty'
  | 'playful'
  | 'blink'
  | 'yawn'
  | 'hurt';

const OUTLINE = 0x2a2333;
const WHITE = 0xfdfdff;
const CHEEK = 0xf2969c;
const TEAR = 0x9fd4f0;
const TONGUE = 0xe87f92;

interface Layout {
  eyeX: number;
  eyeY: number;
  eyeRx: number;
  eyeRy: number;
  mouthY: number;
  cheekY: number;
}

/** Olhos grandes; filhotes com olhos enormes. */
function layoutFor(stage: LifeStage, speciesIndex: number): Layout {
  const p = proportionsFor(stage, speciesIndex);
  const baby = stage === 0;
  const elder = stage === 2;
  return {
    // Olhos ENORMES, quase encostando um no outro: é a marca da criatura.
    eyeX: p.headX + (baby ? 4.4 : 4.5),
    eyeY: p.headY + (baby ? 1.6 : 1),
    eyeRx: baby ? 3.9 : elder ? 3.2 : 3.6,
    eyeRy: baby ? 4.2 : elder ? 3.2 : 3.8,
    mouthY: p.headY + (baby ? 7 : 6.4),
    cheekY: p.headY + (baby ? 4.6 : 4.2),
  };
}

export function makeFaceTexture(
  expression: Expression,
  eyeColor: number,
  stage: LifeStage,
  features: Features,
  speciesIndex: number,
): Texture {
  const buffer = new PixelBuffer(SPRITE_SIZE, SPRITE_SIZE);
  const p = proportionsFor(stage, speciesIndex);
  const layout = layoutFor(stage, speciesIndex);
  const cx = p.headX + p.lean;
  const leftX = cx - (layout.eyeX - p.headX);
  const rightX = cx + (layout.eyeX - p.headX);
  const shine = mix(eyeColor, 0xffffff, 0.85);

  const closedEye = (x: number, curve: number): void => {
    for (let i = -2; i <= 2; i++) {
      buffer.set(x + i, layout.eyeY + Math.round(Math.abs(i) * curve), OUTLINE);
    }
  };

  /**
   * O olho do Tintim: um bloco branco grande com a pupila dentro.
   *
   * Bloco, não bola. É a mesma decisão da cabeça — num sprite deste tamanho a
   * quina é o que dá caráter, e é o olho quadrado e enorme que faz a criatura
   * parecer que está OLHANDO, em vez de ter dois pontinhos.
   */
  const openEye = (x: number, scale: number, pupilScale = 1): void => {
    const rx = layout.eyeRx * scale;
    const ry = layout.eyeRy * scale;
    const block = (
      cx: number,
      cy: number,
      hw: number,
      hh: number,
      corner: number,
      color: number,
    ): void => {
      for (let py = Math.floor(cy - hh); py <= cy + hh; py++) {
        for (let px = Math.floor(cx - hw); px <= cx + hw; px++) {
          const ox = Math.abs(px - cx) - (hw - corner);
          const oy = Math.abs(py - cy) - (hh - corner);
          if (ox > 0 && oy > 0 && ox * ox + oy * oy > corner * corner) continue;
          buffer.set(px, py, color);
        }
      }
    };
    block(x, layout.eyeY, rx, ry, 1.2, WHITE);
    block(
      x,
      layout.eyeY + ry * 0.14,
      Math.max(1, rx * 0.42 * pupilScale),
      Math.max(1, ry * 0.46 * pupilScale),
      0.8,
      eyeColor,
    );
    // Brilho no canto de cima, onde bate a luz.
    buffer.set(x - rx * 0.45, layout.eyeY - ry * 0.5, shine);
  };

  /** Sobrancelha: `tilt` positivo baixa a ponta interna (brava). */
  const brow = (x: number, dir: number, tilt: number, lift: number): void => {
    const y = layout.eyeY - layout.eyeRy - 1.5 - lift;
    for (let i = -2; i <= 2; i++) {
      buffer.set(x + i, Math.round(y + i * dir * tilt), OUTLINE);
    }
  };

  const cheeks = (): void => {
    for (const x of [cx - 8.5, cx + 8.5]) {
      buffer.ellipse(x, layout.cheekY, 2, 1.4, CHEEK, 190);
    }
  };

  const smile = (width: number, depth: number): void => {
    for (let i = -width; i <= width; i++) {
      buffer.set(cx + i, layout.mouthY + Math.round((width - Math.abs(i)) * depth * 0.5), OUTLINE);
    }
  };

  const frown = (width: number): void => {
    for (let i = -width; i <= width; i++) {
      buffer.set(cx + i, layout.mouthY + Math.round(Math.abs(i) * 0.6), OUTLINE);
    }
  };

  if (features.cheeks) cheeks();

  switch (expression) {
    case 'happy':
      // Olhos em arco feliz (^ ^) e sorriso aberto.
      for (const [x, dir] of [
        [leftX, 1],
        [rightX, -1],
      ] as const) {
        for (let i = -2; i <= 2; i++)
          buffer.set(x + i * dir, layout.eyeY - 1 + Math.abs(i), OUTLINE);
        buffer.set(x, layout.eyeY - 2, OUTLINE);
      }
      smile(3, 1);
      buffer.set(cx, layout.mouthY + 2, OUTLINE);
      cheeks();
      break;

    case 'loved':
      // Olhos fechados de felicidade + bochechas fortes + sorriso grande.
      for (const x of [leftX, rightX]) {
        for (let i = -2; i <= 2; i++) buffer.set(x + i, layout.eyeY - Math.abs(i) + 1, OUTLINE);
      }
      smile(4, 1);
      buffer.set(cx - 1, layout.mouthY + 2, OUTLINE);
      buffer.set(cx + 1, layout.mouthY + 2, OUTLINE);
      for (const x of [cx - 8.5, cx + 8.5]) buffer.ellipse(x, layout.cheekY, 2.4, 1.8, CHEEK, 230);
      break;

    case 'needy':
      // Olhos enormes e marejados, sobrancelhas erguidas por dentro.
      openEye(leftX, 1.18, 1.15);
      openEye(rightX, 1.18, 1.15);
      brow(leftX, 1, 0.5, 1);
      brow(rightX, -1, 0.5, 1);
      frown(2);
      buffer.set(leftX - 3, layout.eyeY + 3, TEAR);
      break;

    case 'sleepy':
      closedEye(leftX, 0.5);
      closedEye(rightX, 0.5);
      buffer.ellipse(cx, layout.mouthY, 1.4, 1.2, OUTLINE);
      break;

    case 'blink':
      closedEye(leftX, 0.5);
      closedEye(rightX, 0.5);
      buffer.rect(cx - 1, layout.mouthY, 2, 1, OUTLINE);
      break;

    case 'surprised':
      openEye(leftX, 1.25, 0.62);
      openEye(rightX, 1.25, 0.62);
      brow(leftX, 1, 0, 2);
      brow(rightX, -1, 0, 2);
      buffer.ellipse(cx, layout.mouthY + 1, 1.6, 1.8, OUTLINE);
      break;

    case 'angry':
      openEye(leftX, 0.85, 0.9);
      openEye(rightX, 0.85, 0.9);
      brow(leftX, 1, -0.6, 0);
      brow(rightX, -1, -0.6, 0);
      frown(3);
      break;

    case 'sad':
      // Pálpebras caídas e boca para baixo.
      openEye(leftX, 0.92, 0.95);
      openEye(rightX, 0.92, 0.95);
      for (const x of [leftX, rightX]) {
        for (let i = -3; i <= 3; i++) buffer.set(x + i, layout.eyeY - layout.eyeRy + 1, OUTLINE);
      }
      brow(leftX, 1, 0.55, 1);
      brow(rightX, -1, 0.55, 1);
      frown(2);
      buffer.set(leftX - 3, layout.eyeY + 4, TEAR);
      buffer.set(leftX - 3, layout.eyeY + 5, TEAR);
      break;

    case 'afraid':
      openEye(leftX, 1.3, 0.5);
      openEye(rightX, 1.3, 0.5);
      brow(leftX, 1, 0.6, 2);
      brow(rightX, -1, 0.6, 2);
      // Boca ondulada de nervosismo.
      for (let i = -2; i <= 2; i++)
        buffer.set(cx + i, layout.mouthY + (i % 2 === 0 ? 0 : 1), OUTLINE);
      break;

    case 'curious':
      // Uma sobrancelha erguida e boquinha de "oh?".
      openEye(leftX, 1.1);
      openEye(rightX, 1.1);
      brow(leftX, 1, 0, 2.5);
      brow(rightX, -1, 0, 0.5);
      buffer.ellipse(cx, layout.mouthY, 1.2, 1, OUTLINE);
      break;

    case 'hungry':
      // Olhos famintos e línguinha lambendo.
      openEye(leftX, 1.05, 1.1);
      openEye(rightX, 1.05, 1.1);
      brow(leftX, 1, 0.35, 0.5);
      brow(rightX, -1, 0.35, 0.5);
      buffer.rect(cx - 2, layout.mouthY, 4, 1, OUTLINE);
      buffer.ellipse(cx + 2, layout.mouthY + 1.5, 1.4, 1.2, TONGUE);
      break;

    case 'thirsty':
      // Boca entreaberta e língua para fora.
      openEye(leftX, 0.95);
      openEye(rightX, 0.95);
      buffer.ellipse(cx, layout.mouthY + 1, 2, 1.6, OUTLINE);
      buffer.ellipse(cx, layout.mouthY + 1.8, 1.4, 1.2, TONGUE);
      break;

    case 'playful':
      // Olhos travessos (um piscando) e sorrisão.
      openEye(leftX, 1.12);
      for (let i = -2; i <= 2; i++) buffer.set(rightX + i, layout.eyeY - Math.abs(i) + 1, OUTLINE);
      smile(4, 1);
      buffer.set(cx - 1, layout.mouthY + 2, OUTLINE);
      buffer.set(cx + 1, layout.mouthY + 2, OUTLINE);
      buffer.ellipse(cx + 1, layout.mouthY + 2.5, 1.2, 1, TONGUE);
      cheeks();
      break;

    case 'hurt':
      // Dor: olhos apertados com força, boca torta para baixo e lágrima.
      for (const x of [leftX, rightX]) {
        for (let i = -2; i <= 2; i++) {
          buffer.set(x + i, layout.eyeY - Math.abs(i) * 0.5 + 1, OUTLINE);
          buffer.set(x + i, layout.eyeY - Math.abs(i) * 0.5, OUTLINE);
        }
      }
      // Sobrancelhas franzidas para dentro.
      for (let i = 0; i < 4; i++) {
        buffer.set(leftX - 1 + i, layout.eyeY - 4 - i * 0.5, OUTLINE);
        buffer.set(rightX + 1 - i, layout.eyeY - 4 - i * 0.5, OUTLINE);
      }
      // Boca aberta em careta.
      buffer.ellipse(cx, layout.mouthY + 1, 2.2, 1.6, OUTLINE);
      buffer.set(cx - 3, layout.mouthY, OUTLINE);
      buffer.set(cx + 3, layout.mouthY, OUTLINE);
      // Lágrima escorrendo.
      buffer.ellipse(leftX - 3, layout.eyeY + 3, 1, 1.6, TEAR);
      break;

    case 'yawn':
      // Bocejo: olhos apertados e boca bem aberta.
      closedEye(leftX, 0.5);
      closedEye(rightX, 0.5);
      buffer.ellipse(cx, layout.mouthY + 1.5, 2.4, 2.8, OUTLINE);
      buffer.ellipse(cx, layout.mouthY + 2.4, 1.4, 1.4, TONGUE);
      break;

    default:
      openEye(leftX, 1);
      openEye(rightX, 1);
      buffer.rect(cx - 1, layout.mouthY, 2, 1, OUTLINE);
      break;
  }

  // Bigodinhos e sardas, se a criatura os tiver.
  if (features.whiskers) {
    for (const dir of [-1, 1]) {
      const x = cx + dir * 9;
      buffer.set(x, layout.mouthY - 1, OUTLINE);
      buffer.set(x + dir, layout.mouthY - 1, OUTLINE);
      buffer.set(x, layout.mouthY + 1, OUTLINE);
      buffer.set(x + dir, layout.mouthY + 1, OUTLINE);
    }
  }
  if (features.freckles) {
    const freckle = mix(eyeColor, CHEEK, 0.5);
    for (const dir of [-1, 1]) {
      buffer.set(cx + dir * 7, layout.cheekY - 1, freckle);
      buffer.set(cx + dir * 9, layout.cheekY, freckle);
      buffer.set(cx + dir * 7, layout.cheekY + 1, freckle);
    }
  }

  return buffer.toTexture();
}
