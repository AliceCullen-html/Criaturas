import {
  createRng,
  tileCenterX,
  tileCenterY,
  tileColOf,
  tileCols,
  tileRowOf,
  tileRows,
  TILE,
  type Rng,
} from '@core';
import { defineResource } from '@engine';
import { isWaterAt, type Terrain } from './terrain';

/**
 * O que pode ocupar uma casa do tabuleiro.
 *
 * O computador é o único item ARTIFICIAL do jardim — a máquina que ensina
 * palavras. Ele entra aqui, junto das árvores e pedras, porque no tabuleiro ele
 * é a mesma coisa que elas: ocupa uma casa, tem sombra, e o jogador pode pegá-lo
 * e mudá-lo de lugar. Onde ele fica é decisão de quem joga — perto do lago, no
 * meio do ninho, longe de tudo — e isso muda quem aprende a falar.
 */
export type SceneryKind = 'tree' | 'rock' | 'bush' | 'computer';

export interface SceneryPiece {
  kind: SceneryKind;
  /**
   * A casa do tabuleiro. É ela que manda — `x`/`y` são sempre o centro dela.
   * Guardar as duas coisas é redundância proposital: o resto do jogo (frutas
   * caindo, sombra, memória de lugar) pensa em pixels, e converter a cada
   * consulta só espalharia a mesma conta por quinze arquivos.
   */
  col: number;
  row: number;
  x: number;
  y: number;
  /** Só árvores: tempo até soltar a próxima fruta madura. */
  fruitTimer: number;
  /** Só o computador: a palavra que está na tela agora. */
  word: number;
  /** Só o computador: segundos até a tela trocar de palavra. */
  wordTimer: number;
  /** Variante visual: árvore comum, florida, frutífera ou com ninho. */
  variant: number;
  /**
   * 0 a 1. Nasce em 1 — o jardim já começa crescido. Só o que o JOGADOR planta
   * começa pequeno, e é isso que dá sentido a plantar: a muda demora, e quem
   * plantou volta para ver.
   */
  growth: number;
}

/**
 * Cenário do mundo. Deixou de ser enfeite do renderer para virar conteúdo do
 * mundo: árvores precisam existir de verdade para produzirem frutas.
 */
export const SceneryResource = defineResource<SceneryPiece[]>('Scenery');

/**
 * Fração das casas com alguma coisa em cima.
 *
 * Num tabuleiro, densidade se escreve assim — "uma casa em cada cinco" — e não
 * como uma contagem por área. A conta passa a valer para qualquer tamanho de
 * mundo sem nenhuma regra de três.
 */
const OCCUPANCY = 0.28;
/** Chance de uma casa de margem receber árvore ou moita (o reflexo mora aí). */
const SHORE_CHANCE = 0.5;

/** Uma casa serve se estiver dentro do mundo e inteira em terra firme. */
export function tileOnLand(terrain: Terrain, col: number, row: number): boolean {
  const x0 = col * TILE;
  const y0 = row * TILE;
  // A última fila pode passar da borda (as casas arredondam para cima). Uma
  // árvore com o pé fora do mundo não existe para ninguém: fica de fora.
  if (
    tileCenterX(col) >= terrain.cols * terrain.cellSize ||
    tileCenterY(row) >= terrain.rows * terrain.cellSize
  ) {
    return false;
  }
  // Amostra 3×3 dentro da casa: a grade do terreno é de 10px, então cinco
  // pontos deixariam passar uma língua de água entrando pelo canto.
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const x = x0 + ((sx + 0.5) / 3) * TILE;
      const y = y0 + ((sy + 0.5) / 3) * TILE;
      if (isWaterAt(terrain, x, y)) return false;
    }
  }
  return true;
}

/** O que está naquela casa, se houver algo. */
export function pieceAtTile(
  scenery: readonly SceneryPiece[],
  col: number,
  row: number,
): SceneryPiece | null {
  for (const piece of scenery) if (piece.col === col && piece.row === row) return piece;
  return null;
}

/** Casa de um ponto qualquer do mundo. */
export const tileAt = (x: number, y: number): { col: number; row: number } => ({
  col: tileColOf(x),
  row: tileRowOf(y),
});

/** Planta a peça numa casa: posição e casa andam sempre juntas. */
export function placeOnTile(piece: SceneryPiece, col: number, row: number): void {
  piece.col = col;
  piece.row = row;
  piece.x = tileCenterX(col);
  piece.y = tileCenterY(row);
}

/** Cria uma peça já plantada na casa indicada. */
export function makePiece(
  kind: SceneryKind,
  col: number,
  row: number,
  variant: number,
  fruitTimer: number,
  growth = 1,
): SceneryPiece {
  return {
    kind,
    col,
    row,
    x: tileCenterX(col),
    y: tileCenterY(row),
    fruitTimer,
    variant,
    growth,
    word: 0,
    wordTimer: 0,
  };
}

/**
 * Põe o computador no jardim.
 *
 * Uma máquina só, e no MEIO do mundo — não porque o centro seja bonito, mas
 * porque ele é o lugar que toda criatura acaba atravessando. Se a máquina
 * nascesse num canto, a espécie inteira poderia viver e morrer sem nunca
 * esbarrar nela, e a linguagem seria um sistema que existe e nunca acontece.
 *
 * A partir daí quem manda é o jogador: o computador se arrasta como qualquer
 * peça, e mudá-lo de lugar é decidir quem vai aprender a falar.
 */
export function placeComputer(
  pieces: SceneryPiece[],
  terrain: Terrain,
  width: number,
  height: number,
): SceneryPiece | null {
  const cols = tileCols(width);
  const rows = tileRows(height);
  const midCol = (cols - 1) / 2;
  const midRow = (rows - 1) / 2;

  // A mesma regra de vizinhança do resto do tabuleiro: nada encosta em nada.
  // A máquina não é exceção — encostada numa árvore ela vira parede, e ainda
  // por cima uma parede onde as criaturas precisam parar para ler.
  const free = (col: number, row: number): boolean =>
    tileOnLand(terrain, col, row) && !pieceAtTile(pieces, col, row);
  const isolated = (col: number, row: number): boolean =>
    !pieceAtTile(pieces, col - 1, row) &&
    !pieceAtTile(pieces, col + 1, row) &&
    !pieceAtTile(pieces, col, row - 1) &&
    !pieceAtTile(pieces, col, row + 1);

  /** A casa livre mais próxima do centro, exigindo ou não vizinhança limpa. */
  const search = (demanding: boolean): { col: number; row: number } | null => {
    let best: { col: number; row: number; distance: number } | null = null;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!free(col, row)) continue;
        if (demanding && !isolated(col, row)) continue;
        const distance = Math.hypot(col - midCol, row - midRow);
        if (!best || distance < best.distance) best = { col, row, distance };
      }
    }
    return best;
  };

  // Duas passadas: a casa ideal é livre E isolada; se o jardim estiver cheio
  // demais para isso, aceita-se qualquer casa livre — melhor uma máquina
  // apertada entre duas árvores que um mundo sem linguagem nenhuma.
  const best = search(true) ?? search(false);
  if (!best) return null;

  const machine = makePiece('computer', best.col, best.row, 0, 0);
  pieces.push(machine);
  return machine;
}

export function generateScenery(
  terrain: Terrain,
  width: number,
  height: number,
  seed: number,
): SceneryPiece[] {
  const rng: Rng = createRng(seed ^ 0x51ce7e);
  const cols = tileCols(width);
  const rows = tileRows(height);
  const taken = new Uint8Array(cols * rows);
  const pieces: SceneryPiece[] = [];

  /**
   * O que há na casa. Fora do tabuleiro não há NADA — e é importante que seja
   * assim: se o lado de fora contasse como ocupado, a fila inteira de casas da
   * borda seria descartada pela regra de vizinhança abaixo, e o jardim
   * nasceria com uma moldura vazia de dois metros em volta.
   */
  const occupied = (col: number, row: number): boolean =>
    col >= 0 && row >= 0 && col < cols && row < rows && taken[row * cols + col] === 1;

  /**
   * Nada encosta em nada.
   *
   * Sem esta regra o sorteio junta três árvores em L e o jardim ganha um muro
   * de mata onde ninguém passa nem enxerga. Vizinhança livre é o que faz o
   * tabuleiro parecer plantado e não derramado.
   */
  const isolated = (col: number, row: number): boolean =>
    !occupied(col - 1, row) &&
    !occupied(col + 1, row) &&
    !occupied(col, row - 1) &&
    !occupied(col, row + 1);

  const place = (kind: SceneryKind, col: number, row: number): void => {
    pieces.push(makePiece(kind, col, row, rng.int(4), rng.range(8, 40)));
    taken[row * cols + col] = 1;
  };

  // ---- Primeiro a margem -----------------------------------------------
  // A copa debruçada sobre a água é o que aparece de cabeça para baixo nela.
  // Deixar isso ao acaso quase nunca acontece: o lago fica cercado de nada e o
  // reflexo não tem o que refletir. Por isso a margem escolhe antes.
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      if (occupied(col, row) || !tileOnLand(terrain, col, row)) continue;
      if (tileOnLand(terrain, col, row + 1)) continue; // a casa da frente não é água
      if (!isolated(col, row)) continue;
      if (!rng.chance(SHORE_CHANCE)) continue;
      place(rng.chance(0.65) ? 'tree' : 'bush', col, row);
    }
  }

  // ---- Depois o resto do jardim ----------------------------------------
  const kinds: SceneryKind[] = ['tree', 'tree', 'tree', 'rock', 'bush'];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (occupied(col, row) || !tileOnLand(terrain, col, row)) continue;
      if (!isolated(col, row)) continue;
      if (!rng.chance(OCCUPANCY)) continue;
      place(rng.pick(kinds), col, row);
    }
  }

  return pieces;
}
