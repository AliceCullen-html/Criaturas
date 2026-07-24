import { createRng, type Rng } from '@core';
import { defineResource } from '@engine';
import { isWaterAt, type Terrain } from './terrain';

export type SceneryKind = 'tree' | 'rock' | 'bush';

export interface SceneryPiece {
  kind: SceneryKind;
  x: number;
  y: number;
  /** Só árvores: tempo até soltar a próxima fruta madura. */
  fruitTimer: number;
}

/**
 * Cenário do mundo. Deixou de ser enfeite do renderer para virar conteúdo do
 * mundo: árvores precisam existir de verdade para produzirem frutas.
 */
export const SceneryResource = defineResource<SceneryPiece[]>('Scenery');

const COUNT = 78;

export function generateScenery(
  terrain: Terrain,
  width: number,
  height: number,
  seed: number,
): SceneryPiece[] {
  const rng: Rng = createRng(seed ^ 0x51ce7e);
  const pieces: SceneryPiece[] = [];
  const kinds: SceneryKind[] = ['tree', 'tree', 'tree', 'rock', 'bush'];

  let attempts = 0;
  while (pieces.length < COUNT && attempts < COUNT * 30) {
    attempts++;
    const x = rng.range(20, width - 20);
    const y = rng.range(20, height - 20);
    // Nada nasce na água nem colado nela.
    if (
      isWaterAt(terrain, x, y) ||
      isWaterAt(terrain, x + 18, y) ||
      isWaterAt(terrain, x - 18, y)
    ) {
      continue;
    }
    if (isWaterAt(terrain, x, y + 18) || isWaterAt(terrain, x, y - 18)) continue;

    const kind = rng.pick(kinds);
    pieces.push({ kind, x, y, fruitTimer: rng.range(8, 40) });
  }

  return pieces;
}
