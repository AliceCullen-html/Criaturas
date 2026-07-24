import type { Rng } from '@core';
import type { TileGrid } from '@engine';

export const GROUND = 0;
export const WATER = 1;

/** Terreno em grade. Satisfaz `TileGrid` para o renderer desenhar as células. */
export interface Terrain extends TileGrid {
  readonly cells: Uint8Array;
}

const MIN_PONDS = 3;
const MAX_PONDS = 6;

/** Gera um terreno com alguns lagos circulares, de forma determinística (via RNG). */
export function generateTerrain(
  width: number,
  height: number,
  cellSize: number,
  rng: Rng,
): Terrain {
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const cells = new Uint8Array(cols * rows); // GROUND por padrão

  const ponds = MIN_PONDS + rng.int(MAX_PONDS - MIN_PONDS + 1);
  for (let p = 0; p < ponds; p++) {
    const centerX = rng.int(cols);
    const centerY = rng.int(rows);
    const radius = 2 + rng.int(4);
    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const dx = x - centerX;
        const dy = y - centerY;
        if (dx * dx + dy * dy <= radius * radius) {
          cells[y * cols + x] = WATER;
        }
      }
    }
  }

  return { cols, rows, cellSize, cells };
}

export function isWaterAt(terrain: Terrain, x: number, y: number): boolean {
  const cellX = Math.floor(x / terrain.cellSize);
  const cellY = Math.floor(y / terrain.cellSize);
  if (cellX < 0 || cellY < 0 || cellX >= terrain.cols || cellY >= terrain.rows) {
    return false;
  }
  return terrain.cells[cellY * terrain.cols + cellX] === WATER;
}
