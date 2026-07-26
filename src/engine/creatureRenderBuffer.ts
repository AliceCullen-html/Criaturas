/**
 * Buffer de projeção das criaturas para o render, em *Structure of Arrays*
 * pré-alocado. Diferente do `RenderBuffer` (plantas em batch), carrega o `id`
 * de cada criatura — necessário para o render manter uma view por criatura
 * (corpo + rosto animados) e para o *hit-test* de seleção por clique.
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
  readonly accentColor: Uint32Array;
  readonly dna: Uint32Array;
  readonly species: Uint8Array;
  readonly mood: Uint8Array;
  readonly stage: Uint8Array;
  readonly moving: Uint8Array;
  /** Microcomportamento em curso (índice em POSE, de @core). */
  readonly pose: Uint8Array;
  /** Progresso dentro da pose, 0..1 — o renderer anima a partir disto. */
  readonly poseTime: Float32Array;
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
    this.accentColor = new Uint32Array(capacity);
    this.dna = new Uint32Array(capacity);
    this.species = new Uint8Array(capacity);
    this.mood = new Uint8Array(capacity);
    this.stage = new Uint8Array(capacity);
    this.moving = new Uint8Array(capacity);
    this.pose = new Uint8Array(capacity);
    this.poseTime = new Float32Array(capacity);
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
    accentColor: number,
    dna: number,
    species: number,
    mood: number,
    stage: number,
    moving: number,
    pose: number,
    poseTime: number,
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
    this.accentColor[i] = accentColor;
    this.dna[i] = dna;
    this.species[i] = species;
    this.mood[i] = mood;
    this.stage[i] = stage;
    this.moving[i] = moving;
    this.pose[i] = pose;
    this.poseTime[i] = poseTime;
    this.count = i + 1;
  }
}
