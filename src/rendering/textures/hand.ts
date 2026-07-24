import type { Texture } from 'pixi.js';
import { PixelBuffer, shade } from '../pixel/PixelBuffer';

/** Estados da mão — a presença do jogador dentro do mundo. */
export type HandState =
  'open' | 'closing' | 'holding' | 'pointing' | 'petting' | 'rough' | 'dropping';

const SKIN = 0xf0c9a4;
const SHADOW = shade(SKIN, 0.82);
const OUTLINE = 0x5a3f2c;
const SIZE = 20;

/** Desenha uma mãozinha estilizada; `fingers` controla o quanto está fechada. */
function drawHand(fingers: number, pointing: boolean, tilt: number): Texture {
  const b = new PixelBuffer(SIZE, SIZE);
  const cx = 9;
  const cy = 11 + tilt;

  // Palma.
  b.ellipse(cx, cy, 4.2, 4.6, SKIN);
  b.ellipse(cx, cy + 1.5, 3.4, 3, SHADOW);
  b.ellipse(cx, cy - 0.5, 3.6, 3.6, SKIN);

  // Dedos: `fingers` 0 = esticados, 1 = fechados.
  const spread = 1 - fingers;
  const fingerTop = cy - 4.5 - spread * 3.4;
  for (let i = 0; i < 4; i++) {
    const fx = cx - 3 + i * 2;
    const length = 2 + spread * 3.2 - Math.abs(i - 1.5) * 0.5;
    if (pointing && i === 1) {
      // Indicador esticado para cima.
      b.rect(fx, cy - 9, 2, 9, SKIN);
      b.set(fx, cy - 9, SKIN);
      continue;
    }
    b.rect(
      fx,
      Math.round(fingerTop + (pointing ? 2 : 0)),
      2,
      Math.max(1, Math.round(length)),
      SKIN,
    );
  }

  // Polegar.
  b.ellipse(cx - 4.6, cy + 1 - spread, 1.8, 2.4, SKIN);

  // Punho.
  b.rect(cx - 2, cy + 4, 4, 3, SHADOW);
  b.rect(cx - 2, cy + 6, 4, 1, OUTLINE);

  return b.toTexture();
}

export function makeHandTextures(): Record<HandState, Texture> {
  return {
    open: drawHand(0, false, 0),
    closing: drawHand(0.55, false, 0),
    holding: drawHand(1, false, 0),
    pointing: drawHand(0.75, true, 0),
    petting: drawHand(0.25, false, 1),
    rough: drawHand(0.9, false, -1),
    dropping: drawHand(0.3, false, 1),
  };
}
