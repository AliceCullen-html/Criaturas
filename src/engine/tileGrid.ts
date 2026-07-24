/**
 * Grade de tiles neutra, consumível pelo renderer sem que ele conheça a
 * semântica do domínio (terreno, biomas...). O `world` fornece uma estrutura
 * que satisfaz esta interface; o app decide as cores por valor de célula.
 */
export interface TileGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly cells: Uint8Array;
}
