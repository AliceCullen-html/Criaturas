/**
 * A grade do jardim.
 *
 * O mundo passou a ser um TABULEIRO: o chão é feito de casas quadradas, e cada
 * árvore, pedra ou moita ocupa uma casa inteira — nunca meia, nunca duas.
 *
 * Isso muda menos coisas do que parece. A simulação continua contínua: as
 * criaturas andam em ponto flutuante, atravessam casas pelo meio e não sabem
 * que a grade existe. A grade governa só **onde o cenário pode estar**, e é o
 * que permite arrastar uma pedra e ela POUSAR em algum lugar, em vez de flutuar
 * onde o dedo largou.
 *
 * Mora em `@core` porque é o único vocabulário que a simulação e o renderer
 * precisam ler igual: um decide que a árvore está na casa (7, 4), o outro
 * desenha o losango daquela casa acesa embaixo dela. Como nenhum dos dois pode
 * importar o outro, a definição fica aqui embaixo dos dois.
 */

/**
 * Lado da casa, em pixels de mundo.
 *
 * Escolhido pelo que cabe dentro: uma criatura adulta mede ~22px, uma árvore
 * madura ~50. Com 50 a árvore preenche a casa e a criatura passa por baixo
 * dela; com 30 a copa invadiria as vizinhas e a grade sumiria debaixo da mata.
 */
export const TILE = 50;

export const tileColOf = (x: number): number => Math.floor(x / TILE);
export const tileRowOf = (y: number): number => Math.floor(y / TILE);

/** Centro da casa — é onde o cenário fica plantado, sempre. */
export const tileCenterX = (col: number): number => (col + 0.5) * TILE;
export const tileCenterY = (row: number): number => (row + 0.5) * TILE;

/**
 * Quantas casas cabem. Arredonda para CIMA de propósito: uma faixa de mundo
 * sem casa nenhuma seria uma faixa sem chão desenhado. Quando o mundo não é
 * múltiplo exato do lado da casa, a última fila passa um pouco da borda — e
 * quem coloca cenário confere se o centro dela ainda está dentro do mundo.
 */
export const tileCols = (width: number): number => Math.max(1, Math.ceil(width / TILE));
export const tileRows = (height: number): number => Math.max(1, Math.ceil(height / TILE));

/** Índice linear da casa, para mapas de ocupação. */
export const tileIndex = (col: number, row: number, cols: number): number => row * cols + col;
