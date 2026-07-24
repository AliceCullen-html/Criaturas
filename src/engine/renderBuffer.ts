/**
 * Buffer de projeção para o render, em *Structure of Arrays* pré-alocado.
 *
 * É a fronteira "somente-leitura" entre a simulação (escreve) e o renderer
 * (lê): dados planos, sem objetos por entidade, reutilizados a cada quadro
 * (zero alocação → zero pressão de GC). Também é o formato que um dia atravessa
 * a Web Worker.
 */
export class RenderBuffer {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly prevX: Float32Array;
  readonly prevY: Float32Array;
  readonly radius: Float32Array;
  readonly color: Uint32Array;
  readonly variant: Uint8Array;
  count = 0;

  constructor(readonly capacity: number) {
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.prevX = new Float32Array(capacity);
    this.prevY = new Float32Array(capacity);
    this.radius = new Float32Array(capacity);
    this.color = new Uint32Array(capacity);
    this.variant = new Uint8Array(capacity);
  }

  clear(): void {
    this.count = 0;
  }

  push(
    x: number,
    y: number,
    prevX: number,
    prevY: number,
    radius: number,
    color: number,
    variant: number,
  ): void {
    const i = this.count;
    if (i >= this.capacity) return;
    this.x[i] = x;
    this.y[i] = y;
    this.prevX[i] = prevX;
    this.prevY[i] = prevY;
    this.radius[i] = radius;
    this.color[i] = color;
    this.variant[i] = variant;
    this.count = i + 1;
  }
}
