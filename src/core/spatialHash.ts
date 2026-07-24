/**
 * Spatial hash uniforme para pontos 2D — acelera consultas de vizinhança
 * ("quem está perto de mim?") de O(n) para ~O(1) amortizado.
 *
 * É *broad-phase*: `query` devolve candidatos nas células próximas; o chamador
 * ainda faz a checagem fina de distância. Genérico e sem alocação nas consultas
 * (escreve num array reutilizado).
 */
export class SpatialHash {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: Map<number, number[]> = new Map();

  constructor(
    private readonly cellSize: number,
    width: number,
    height: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
  }

  private cellKey(cellX: number, cellY: number): number {
    return cellY * this.cols + cellX;
  }

  private clampX(cellX: number): number {
    return cellX < 0 ? 0 : cellX >= this.cols ? this.cols - 1 : cellX;
  }

  private clampY(cellY: number): number {
    return cellY < 0 ? 0 : cellY >= this.rows ? this.rows - 1 : cellY;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(id: number, x: number, y: number): void {
    const cellX = this.clampX(Math.floor(x / this.cellSize));
    const cellY = this.clampY(Math.floor(y / this.cellSize));
    const key = this.cellKey(cellX, cellY);
    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push(id);
    } else {
      this.cells.set(key, [id]);
    }
  }

  /**
   * Coleta em `out` (limpo antes) os ids nas células que cobrem o círculo
   * (x, y, radius). Retorna `out` para encadear.
   */
  query(x: number, y: number, radius: number, out: number[]): number[] {
    out.length = 0;
    const minX = this.clampX(Math.floor((x - radius) / this.cellSize));
    const maxX = this.clampX(Math.floor((x + radius) / this.cellSize));
    const minY = this.clampY(Math.floor((y - radius) / this.cellSize));
    const maxY = this.clampY(Math.floor((y + radius) / this.cellSize));

    for (let cellY = minY; cellY <= maxY; cellY++) {
      for (let cellX = minX; cellX <= maxX; cellX++) {
        const bucket = this.cells.get(this.cellKey(cellX, cellY));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          out.push(bucket[i]!);
        }
      }
    }
    return out;
  }
}
