import { TAU, type Rng } from '@core';
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
/** Fração mínima do jardim que precisa ser água, para ninguém morrer de sede. */
const MIN_WATER_FRACTION = 0.11;
/** Raio dos lagos em pixels de mundo — não em células, para o desenho não
 *  mudar quando a grade fica mais fina. */
const POND_MIN_RADIUS = 55;
const POND_MAX_RADIUS = 130;

const countWater = (cells: Uint8Array): number => {
  let total = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] === WATER) total += 1;
  return total;
};

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

  /**
   * Um lago.
   *
   * Não é um círculo: o raio ondula com três senóides de fases sorteadas, então
   * a margem entra e sai como margem de lago de verdade. Um disco perfeito, na
   * grade, vira uma escadinha simétrica que denuncia na hora que aquilo é um
   * programa desenhando.
   */
  const digPond = (): void => {
    const centerX = rng.range(cols * 0.15, cols * 0.85);
    const centerY = rng.range(rows * 0.15, rows * 0.85);
    const radius = rng.range(POND_MIN_RADIUS, POND_MAX_RADIUS) / cellSize;

    // Três ondulações de frequências diferentes dão um contorno irregular sem
    // parecer ruído puro.
    // Amplitudes contidas de propósito. Com ondulação forte a margem ganha
    // baías fundas, e como ninguém calcula rota a criatura entra na baía atrás
    // de água e não acha mais a saída.
    const waveA = { freq: 2 + rng.int(2), phase: rng.range(0, TAU), depth: rng.range(0.06, 0.13) };
    const waveB = { freq: 4 + rng.int(3), phase: rng.range(0, TAU), depth: rng.range(0.03, 0.07) };
    const waveC = { freq: 7 + rng.int(4), phase: rng.range(0, TAU), depth: rng.range(0.015, 0.035) };

    const reach = Math.ceil(radius * 1.4);
    for (let y = Math.floor(centerY - reach); y <= centerY + reach; y++) {
      for (let x = Math.floor(centerX - reach); x <= centerX + reach; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.hypot(dx, dy);
        if (distance > reach) continue;
        const angle = Math.atan2(dy, dx);
        const wobble =
          1 +
          Math.sin(angle * waveA.freq + waveA.phase) * waveA.depth +
          Math.sin(angle * waveB.freq + waveB.phase) * waveB.depth +
          Math.sin(angle * waveC.freq + waveC.phase) * waveC.depth;
        if (distance <= radius * wobble) cells[y * cols + x] = WATER;
      }
    }
  };

  const minPonds = countFor(MIN_PONDS_BASE, width, height, 2);
  const maxPonds = countFor(MAX_PONDS_BASE, width, height, 3);
  const ponds = minPonds + rng.int(maxPonds - minPonds + 1);
  for (let p = 0; p < ponds; p++) digPond();

  // Piso de água.
  //
  // Os lagos são círculos sorteados, e às vezes o sorteio dá dois lagos
  // minúsculos e sobrepostos: o jardim fica com 5% de água e a população morre
  // de sede sem que nada pareça errado. Um jardim precisa de bebedouro, então
  // a geração cava mais até ter.
  const wanted = cells.length * MIN_WATER_FRACTION;
  for (let tries = 0; tries < 40 && countWater(cells) < wanted; tries++) digPond();

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
