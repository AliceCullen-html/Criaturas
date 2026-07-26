import type { Rng } from '@core';
import type { TileGrid } from '@engine';
import { countFor } from './density';

export const GROUND = 0;
export const WATER = 1;

/** Terreno em grade. Satisfaz `TileGrid` para o renderer desenhar as células. */
export interface Terrain extends TileGrid {
  readonly cells: Uint8Array;
}

/** Lagos num mundo 1000×1000. O raio é em células, então escalar a quantidade
 *  pela área mantém constante a fração de água do jardim. */
const MIN_PONDS_BASE = 3;
const MAX_PONDS_BASE = 6;

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

  const minPonds = countFor(MIN_PONDS_BASE, width, height, 2);
  const maxPonds = countFor(MAX_PONDS_BASE, width, height, 3);
  const ponds = minPonds + rng.int(maxPonds - minPonds + 1);
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

/** Centro da célula de água mais próxima dentro do raio, ou null. */
export function findNearestWater(
  terrain: Terrain,
  x: number,
  y: number,
  radius: number,
): { x: number; y: number } | null {
  const { cols, rows, cellSize, cells } = terrain;
  const centerX = Math.floor(x / cellSize);
  const centerY = Math.floor(y / cellSize);
  const range = Math.ceil(radius / cellSize);

  let bestX = 0;
  let bestY = 0;
  let bestDist = Infinity;
  let found = false;

  for (let cellY = centerY - range; cellY <= centerY + range; cellY++) {
    if (cellY < 0 || cellY >= rows) continue;
    for (let cellX = centerX - range; cellX <= centerX + range; cellX++) {
      if (cellX < 0 || cellX >= cols) continue;
      if (cells[cellY * cols + cellX] !== WATER) continue;
      const wx = (cellX + 0.5) * cellSize;
      const wy = (cellY + 0.5) * cellSize;
      const dist = (wx - x) * (wx - x) + (wy - y) * (wy - y);
      if (dist < bestDist) {
        bestDist = dist;
        bestX = wx;
        bestY = wy;
        found = true;
      }
    }
  }

  return found ? { x: bestX, y: bestY } : null;
}
