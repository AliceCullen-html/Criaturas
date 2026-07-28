import { Rectangle, Texture } from 'pixi.js';
import sheetUrl from '../../assets/terreno.png';

/**
 * A FOLHA DO TERRENO, desenhada à mão.
 *
 * Traz o jardim inteiro: os seis chãos em losango, as árvores, as moitas, as
 * pedras e o mato — e, o que importa mais, SEIS QUADROS DE VENTO para cada
 * coisa que o vento mexe. Até aqui o mundo era desenhado por código: as
 * árvores eram volumes calculados, o mato eram riscos. Isto substitui o
 * desenho, não a lógica — quem decide onde a árvore está continua sendo o
 * jardim.
 *
 * O RECORTE É MEDIDO, NÃO TABELADO.
 *
 * A folha não tem grade regular: cada peça foi desenhada no tamanho que
 * precisava, e uma árvore ao vento ocupa mais espaço num quadro que no outro.
 * Uma tabela de retângulos escritos à mão aqui envelheceria no primeiro
 * retoque da arte. Em vez disso o arquivo é LIDO: as faixas horizontais saem
 * das linhas que têm tinta, as peças saem das colunas que têm tinta dentro da
 * faixa, e o que o código precisa saber de antemão é só o SIGNIFICADO de cada
 * faixa — que é o que a ficha da arte diz.
 *
 * E os quadros de uma animação são alinhados pelo PÉ. Recortar cada quadro na
 * sua própria caixa faria a árvore pular de lado a cada quadro, porque a copa
 * balança e a caixa balança junto; alinhando pelo tronco, o tronco fica parado
 * e só a copa se mexe, que é o que o vento faz.
 */

/** Quantos quadros tem cada animação da folha. */
export const WIND_FRAMES = 6;

/**
 * Gap horizontal abaixo do qual dois borrões são a MESMA peça.
 *
 * Medido na folha: dentro de um tufo as folhas ficam a quatro ou sete pixels
 * uma da outra; entre dois quadros do tufo sobram treze ou mais. Dez separa os
 * dois casos — com quatorze, dois quadros do mato baixo viravam um só.
 */
const SAME_PIECE = 10;
/**
 * E o gap da FAIXA DOS CHÃOS.
 *
 * Um losango de chão é uma mancha sólida, sem ar dentro: dois pixels de fundo
 * já são a borda de um e o começo do outro. Os chãos ficam a seis pixels um do
 * outro, e com a costura larga das plantas os seis viravam um chão só.
 */
const SAME_TILE = 4;
/** Quantas linhas do fundo da peça contam como "o pé dela". */
const FOOT_ROWS = 3;

export interface TerrainArt {
  /** Os seis chãos, na ordem da folha. */
  tiles: Texture[];
  /** As peças paradas da segunda faixa, na ordem da ficha. */
  statics: Record<StaticName, Texture>;
  /** As animações de vento, seis quadros cada. */
  wind: Record<WindName, Texture[]>;
}

export type StaticName =
  | 'tree'
  | 'fruitTree'
  | 'bush'
  | 'rock'
  | 'mushroom'
  | 'reed'
  | 'tallGrass'
  | 'flower'
  | 'grass'
  | 'log';

export type WindName =
  'tree' | 'fruitTree' | 'bush' | 'reed' | 'tallGrass' | 'grass' | 'flower' | 'mushroom';

/** A ordem das peças paradas na segunda faixa da folha. */
const STATIC_ORDER: readonly StaticName[] = [
  'tree',
  'fruitTree',
  'bush',
  'rock',
  'mushroom',
  'reed',
  'tallGrass',
  'flower',
  'grass',
  'log',
];

/** E a ordem das faixas animadas, da terceira em diante. */
const WIND_ORDER: readonly WindName[] = [
  'tree',
  'fruitTree',
  'bush',
  'reed',
  'tallGrass',
  'grass',
  'flower',
  'mushroom',
];

interface Band {
  top: number;
  bottom: number;
  pieces: Array<{ left: number; right: number }>;
}

export async function loadTerrainArt(): Promise<TerrainArt> {
  const image = new Image();
  image.src = sheetUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Terreno: contexto 2D indisponível.');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  const alpha = (x: number, y: number): number => pixels[(y * image.width + x) * 4 + 3]!;

  const source = Texture.from(canvas).source;
  source.scaleMode = 'nearest';
  const cut = (x: number, y: number, w: number, h: number): Texture =>
    new Texture({ source, frame: new Rectangle(x, y, w, h) });

  const bands = readBands(image.width, image.height, alpha);
  if (bands.length < 2 + WIND_ORDER.length) {
    throw new Error(`Terreno: esperava ${2 + WIND_ORDER.length} faixas, achei ${bands.length}.`);
  }

  // --- Faixa 0: os chãos -------------------------------------------------
  const floor = bands[0]!;
  const tiles = floor.pieces.map((piece) =>
    cut(piece.left, floor.top, piece.right - piece.left + 1, floor.bottom - floor.top + 1),
  );

  // --- Faixa 1: as peças paradas ----------------------------------------
  const stillBand = bands[1]!;
  const statics = {} as Record<StaticName, Texture>;
  STATIC_ORDER.forEach((name, i) => {
    const piece = stillBand.pieces[i];
    if (!piece) return;
    // Cada peça parada tem a própria altura: a caixa é apertada nela, não na
    // faixa inteira — senão uma flor herdaria a altura de uma árvore.
    const box = tighten(piece.left, piece.right, stillBand, alpha);
    statics[name] = cut(
      piece.left,
      box.top,
      piece.right - piece.left + 1,
      box.bottom - box.top + 1,
    );
  });

  // --- Faixas seguintes: as animações -----------------------------------
  const wind = {} as Record<WindName, Texture[]>;
  WIND_ORDER.forEach((name, i) => {
    const band = bands[2 + i];
    if (!band) return;
    wind[name] = alignByFoot(band, alpha, cut);
  });

  return { tiles, statics, wind };
}

/** As faixas horizontais que têm tinta, e as peças dentro de cada uma. */
function readBands(width: number, height: number, alpha: (x: number, y: number) => number): Band[] {
  const bands: Band[] = [];
  let top = -1;
  for (let y = 0; y <= height; y++) {
    let inked = false;
    for (let x = 0; x < width && !inked; x++) if (y < height && alpha(x, y) > 16) inked = true;
    if (inked && top < 0) top = y;
    if (!inked && top >= 0) {
      // A primeira faixa é a dos chãos, e ela costura diferente.
      const gap = bands.length === 0 ? SAME_TILE : SAME_PIECE;
      bands.push({ top, bottom: y - 1, pieces: readPieces(width, top, y - 1, alpha, gap) });
      top = -1;
    }
  }
  return bands;
}

/**
 * As peças de uma faixa.
 *
 * Colunas vizinhas com tinta são a mesma peça — e colunas separadas por pouco
 * espaço TAMBÉM: um tufo de mato tem folhas soltas com ar entre elas, e sem
 * essa costura cada folha viraria uma peça.
 */
function readPieces(
  width: number,
  top: number,
  bottom: number,
  alpha: (x: number, y: number) => number,
  gap: number,
): Array<{ left: number; right: number }> {
  const raw: Array<{ left: number; right: number }> = [];
  let left = -1;
  for (let x = 0; x <= width; x++) {
    let inked = false;
    for (let y = top; y <= bottom && !inked; y++) if (x < width && alpha(x, y) > 16) inked = true;
    if (inked && left < 0) left = x;
    if (!inked && left >= 0) {
      raw.push({ left, right: x - 1 });
      left = -1;
    }
  }

  const merged: Array<{ left: number; right: number }> = [];
  for (const piece of raw) {
    const last = merged[merged.length - 1];
    if (last && piece.left - last.right <= gap) last.right = piece.right;
    else merged.push({ ...piece });
  }
  return merged;
}

/** O topo e a base reais de uma peça dentro da faixa. */
function tighten(
  left: number,
  right: number,
  band: Band,
  alpha: (x: number, y: number) => number,
): { top: number; bottom: number } {
  let top = band.bottom;
  let bottom = band.top;
  for (let y = band.top; y <= band.bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (alpha(x, y) <= 16) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      break;
    }
  }
  return { top: Math.min(top, bottom), bottom };
}

/**
 * Recorta os quadros de uma animação alinhados PELO PÉ.
 *
 * O pé é o meio da tinta nas últimas linhas da peça — o tronco da árvore, a
 * base do tufo. Todos os quadros saem com a mesma largura, centrados nesse
 * ponto: desenhados com âncora no meio de baixo, a planta fica plantada e só o
 * topo dela balança.
 */
function alignByFoot(
  band: Band,
  alpha: (x: number, y: number) => number,
  cut: (x: number, y: number, w: number, h: number) => Texture,
): Texture[] {
  const feet = band.pieces.map((piece) => {
    let first = piece.right;
    let last = piece.left;
    for (let y = band.bottom; y > band.bottom - FOOT_ROWS && y >= band.top; y--) {
      for (let x = piece.left; x <= piece.right; x++) {
        if (alpha(x, y) <= 16) continue;
        if (x < first) first = x;
        if (x > last) last = x;
      }
    }
    return Math.round((first + last) / 2);
  });

  // A largura de todos é a do quadro mais largo em relação ao próprio pé: é o
  // que garante que nenhum quadro seja cortado e que todos coincidam.
  let half = 1;
  band.pieces.forEach((piece, i) => {
    const foot = feet[i]!;
    half = Math.max(half, foot - piece.left + 1, piece.right - foot + 1);
  });

  const height = band.bottom - band.top + 1;
  return band.pieces.map((_piece, i) => cut(feet[i]! - half, band.top, half * 2, height));
}
