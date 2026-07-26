import { createRng, type Rng } from '@core';
import { defineResource } from '@engine';
import { isWaterAt, type Terrain } from './terrain';
import { countFor } from './density';

export type SceneryKind = 'tree' | 'rock' | 'bush';

export interface SceneryPiece {
  kind: SceneryKind;
  x: number;
  y: number;
  /** Só árvores: tempo até soltar a próxima fruta madura. */
  fruitTimer: number;
  /** Variante visual: árvore comum, florida, frutífera ou com ninho. */
  variant: number;
}

/**
 * Cenário do mundo. Deixou de ser enfeite do renderer para virar conteúdo do
 * mundo: árvores precisam existir de verdade para produzirem frutas.
 */
export const SceneryResource = defineResource<SceneryPiece[]>('Scenery');

/** Peças de cenário num mundo 1000×1000. */
const COUNT_BASE = 78;

export function generateScenery(
  terrain: Terrain,
  width: number,
  height: number,
  seed: number,
): SceneryPiece[] {
  const rng: Rng = createRng(seed ^ 0x51ce7e);
  const pieces: SceneryPiece[] = [];
  const kinds: SceneryKind[] = ['tree', 'tree', 'tree', 'rock', 'bush'];

  const count = countFor(COUNT_BASE, width, height, 12);
  let attempts = 0;
  while (pieces.length < count && attempts < count * 30) {
    attempts++;
    const x = rng.range(20, width - 20);
    const y = rng.range(20, height - 20);
    // Nada nasce dentro da água nem com o pé dentro dela. Mas na beira pode:
    // é dali que vem o reflexo na superfície, e uma margem sem nada é vazia.
    if (isWaterAt(terrain, x, y) || isWaterAt(terrain, x, y + 8)) continue;

    const kind = rng.pick(kinds);
    pieces.push({ kind, x, y, fruitTimer: rng.range(8, 40), variant: rng.int(4) });
  }

  plantShore(terrain, pieces, width, height, rng);
  return pieces;
}

/** Árvores e moitas debruçadas sobre a água, num mundo 1000×1000. */
const SHORE_COUNT_BASE = 12;
/** A que distância à frente do pé a água precisa estar para valer o reflexo. */
const SHORE_REACH = 18;

/**
 * Margem norte dos lagos: é dali que a copa cai sobre a água e aparece de
 * cabeça para baixo. Deixar isso ao acaso quase nunca acontece — o lago fica
 * cercado de nada, e o reflexo nunca tem o que refletir.
 */
function plantShore(
  terrain: Terrain,
  pieces: SceneryPiece[],
  width: number,
  height: number,
  rng: Rng,
): void {
  const shoreCount = countFor(SHORE_COUNT_BASE, width, height, 5);
  let planted = 0;
  let attempts = 0;
  while (planted < shoreCount && attempts < shoreCount * 200) {
    attempts++;
    const x = rng.range(20, width - 20);
    const y = rng.range(20, height - 20);
    if (isWaterAt(terrain, x, y) || isWaterAt(terrain, x, y + 6)) continue;
    // Água logo à frente, chão firme sob os pés: é uma margem virada para nós.
    if (!isWaterAt(terrain, x, y + SHORE_REACH)) continue;
    // Sem amontoar: uma margem cheia de árvores coladas vira um muro.
    if (pieces.some((piece) => Math.hypot(piece.x - x, piece.y - y) < 34)) continue;

    pieces.push({
      kind: rng.chance(0.65) ? 'tree' : 'bush',
      x,
      y,
      fruitTimer: rng.range(8, 40),
      variant: rng.int(4),
    });
    planted++;
  }
}
