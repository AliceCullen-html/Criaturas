import { isWaterAt, type Terrain } from './terrain';

/**
 * O jardim tem de ser um só.
 *
 * Uma pedra grande no lugar errado — encostada num lago, ou entre o lago e a
 * borda — fecha a passagem e parte o mundo em duas metades. Quem cai no lado
 * sem comida morre lá, e a população se extingue sem que nada pareça errado na
 * tela.
 *
 * Em vez de tentar adivinhar distâncias seguras, a geração VERIFICA: se pôr
 * aquela pedra ali desconectaria alguma parte do jardim, ela não vai ali. É uma
 * invariante do mundo, não um número mágico.
 *
 * Encurralar continua possível — mas só com as mãos de quem joga.
 */

/** Grade da verificação: grossa o bastante para ser instantânea. */
const CELL = 20;

export interface Blocker {
  x: number;
  y: number;
  radius: number;
}

const blockedCell = (
  terrain: Terrain,
  blockers: readonly Blocker[],
  cx: number,
  cy: number,
): boolean => {
  const x = cx * CELL + CELL / 2;
  const y = cy * CELL + CELL / 2;
  if (isWaterAt(terrain, x, y)) return true;
  for (let i = 0; i < blockers.length; i++) {
    const blocker = blockers[i]!;
    const dx = blocker.x - x;
    const dy = blocker.y - y;
    if (dx * dx + dy * dy < blocker.radius * blocker.radius) return true;
  }
  return false;
};

/**
 * Tamanho da maior região de chão contínuo, em células.
 *
 * Não dá para exigir que o mundo INTEIRO seja conectado: a própria água já
 * separa cantos em alguns terrenos. O que interessa é comparar — se pôr a
 * pedra encolhe a maior região por muito mais do que a área da própria pedra,
 * é porque ela cortou um pedaço fora.
 */
export function largestOpenRegion(
  terrain: Terrain,
  blockers: readonly Blocker[],
  width: number,
  height: number,
): number {
  return mapRegions(terrain, blockers, width, height).biggest;
}

/**
 * Onde fica o maior pedaço contínuo do jardim.
 *
 * Serve para não largar ninguém num canto isolado pela água: um punhado de
 * criaturas do outro lado do lago não alcança nem comida nem companhia, e
 * morre lá sem que nada pareça errado.
 */
export function makeMainlandTest(
  terrain: Terrain,
  blockers: readonly Blocker[],
  width: number,
  height: number,
): (x: number, y: number) => boolean {
  const { free, label, best, cols, rows } = mapRegions(terrain, blockers, width, height);
  return (x, y) => {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
    const cell = cy * cols + cx;
    return free[cell] === 1 && label[cell] === best;
  };
}

interface Regions {
  free: Uint8Array;
  label: Int32Array;
  best: number;
  biggest: number;
  cols: number;
  rows: number;
}

function mapRegions(
  terrain: Terrain,
  blockers: readonly Blocker[],
  width: number,
  height: number,
): Regions {
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);

  const free = new Uint8Array(cols * rows);
  const label = new Int32Array(cols * rows).fill(-1);
  let total = 0;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (blockedCell(terrain, blockers, cx, cy)) continue;
      free[cy * cols + cx] = 1;
      total += 1;
    }
  }
  if (total === 0) return { free, label, best: -1, biggest: 0, cols, rows };

  const queue = new Int32Array(total);
  const done = new Uint8Array(cols * rows);
  let biggest = 0;
  let best = -1;
  let region = 0;

  for (let cell = 0; cell < free.length; cell++) {
    if (free[cell] !== 1 || done[cell]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = cell;
    done[cell] = 1;
    label[cell] = region;
    let size = 0;

    while (head < tail) {
      const key = queue[head++]!;
      size += 1;
      const cx = key % cols;
      const cy = (key - cx) / cols;
      for (let i = 0; i < 4; i++) {
        const nx = cx + (i === 0 ? 1 : i === 1 ? -1 : 0);
        const ny = cy + (i === 2 ? 1 : i === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const next = ny * cols + nx;
        if (free[next] !== 1 || done[next]) continue;
        done[next] = 1;
        label[next] = region;
        queue[tail++] = next;
      }
    }
    if (size > biggest) {
      biggest = size;
      best = region;
    }
    region += 1;
  }

  return { free, label, best, biggest, cols, rows };
}
