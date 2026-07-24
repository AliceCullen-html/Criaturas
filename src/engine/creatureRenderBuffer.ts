/**
 * Buffer de projeção das criaturas para o render, em *Structure of Arrays*
 * pré-alocado. Diferente do `RenderBuffer` (plantas em batch), carrega o `id`
 * de cada criatura — necessário para o render manter uma view por criatura
 * (com olhos/animação) e para o *hit-test* de seleção por clique.
 */
export class CreatureRenderBuffer {
  readonly id: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly prevX: Float32Array;
  readonly prevY: Float32Array;
  readonly size: Float32Array;
  readonly bodyColor: Uint32Array;
  readonly eyeColor: Uint32Array;
  readonly dna: Uint32Array;
  count = 0;

  constructor(readonly capacity: number) {
    this.id = new Int32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.prevX = new Float32Array(capacity);
    this.prevY = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.bodyColor = new Uint32Array(capacity);
    this.eyeColor = new Uint32Array(capacity);
    this.dna = new Uint32Array(capacity);
  }

  clear(): void {
    this.count = 0;
  }

  push(
    id: number,
    x: number,
    y: number,
    prevX: number,
    prevY: number,
    size: number,
    bodyColor: number,
    eyeColor: number,
    dna: number,
  ): void {
    const i = this.count;
    if (i >= this.capacity) return;
    this.id[i] = id;
    this.x[i] = x;
    this.y[i] = y;
    this.prevX[i] = prevX;
    this.prevY[i] = prevY;
    this.size[i] = size;
    this.bodyColor[i] = bodyColor;
    this.eyeColor[i] = eyeColor;
    this.dna[i] = dna;
    this.count = i + 1;
  }
}
