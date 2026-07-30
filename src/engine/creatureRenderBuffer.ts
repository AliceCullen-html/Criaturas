/**
 * Buffer de projeção das criaturas para o render, em *Structure of Arrays*
 * pré-alocado. Diferente do `RenderBuffer` (plantas em batch), carrega o `id`
 * de cada criatura — necessário para o render manter uma view por criatura
 * (corpo + rosto animados) e para o *hit-test* de seleção por clique.
 *
 * O QUE ATRAVESSA A FRONTEIRA. Este buffer é a única coisa que o renderer sabe
 * sobre uma criatura, e por isso ele carrega mais do que posição e cor: a
 * intenção, o medo, a cicatriz, a saúde. Não é vazamento de simulação para
 * dentro do desenho — é o contrário. Quem escolhe a animação é a máquina de
 * estados do renderer, e ela precisa dos MESMOS sinais que a criatura tem, ou
 * volta a ser um desenho que não sabe o que está acontecendo com o corpo.
 */
export interface CreatureRenderRow {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  size: number;
  bodyColor: number;
  eyeColor: number;
  accentColor: number;
  dna: number;
  species: number;
  mood: number;
  stage: number;
  moving: number;
  pose: number;
  poseTime: number;
  carrying: number;
  egg: number;
  playing: number;
  intent: number;
  carried: number;
  lift: number;
  prevLift: number;
  scar: number;
  fear: number;
  happiness: number;
  energy: number;
  health: number;
}

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
  /** 1 quando está levando alguma coisa na boca: tem quadro próprio. */
  readonly carrying: Uint8Array;
  /**
   * -1 para quem já nasceu; 0..1 para quem ainda está no ovo, medindo o quanto
   * falta para romper. O ovo viaja pelo MESMO buffer das criaturas de propósito:
   * ele ocupa o mesmo lugar no mundo, tem a mesma sombra, entra na mesma
   * ordenação por profundidade e se clica do mesmo jeito.
   */
  readonly egg: Float32Array;
  /**
   * 0 = não está brincando; 1..5 = o quadro de brincar com a bola (olhar,
   * empurrar, pular, abraçar, perseguir).
   *
   * Canal próprio, e não mais uma pose: pose é maneirismo de quem não está
   * fazendo nada, e brincar é o que ela ESTÁ fazendo.
   */
  readonly playing: Uint8Array;
  /** O que ela está tentando fazer (índice em INTENT, de @core). */
  readonly intent: Uint8Array;
  /** 1 enquanto ela está no colo do jogador — no ar, e não no chão. */
  readonly carried: Uint8Array;
  /**
   * A que altura do chão ela está, em pixels de TELA — no colo ou caindo.
   *
   * De tela, e não de mundo, porque o jardim é plano: a terceira dimensão aqui
   * é desenho, a mesma da bola. Vem com o valor do passo anterior porque a
   * queda dura poucos décimos e a simulação corre a vinte passos por segundo:
   * sem interpolar, um tombo desce em degraus.
   */
  readonly lift: Float32Array;
  readonly prevLift: Float32Array;
  /** A marca que não passa, 0..1 — o corpo de uma criatura marcada é outro. */
  readonly scar: Float32Array;
  readonly fear: Float32Array;
  readonly happiness: Float32Array;
  readonly energy: Float32Array;
  readonly health: Float32Array;
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
    this.carrying = new Uint8Array(capacity);
    this.egg = new Float32Array(capacity);
    this.playing = new Uint8Array(capacity);
    this.intent = new Uint8Array(capacity);
    this.carried = new Uint8Array(capacity);
    this.lift = new Float32Array(capacity);
    this.prevLift = new Float32Array(capacity);
    this.scar = new Float32Array(capacity);
    this.fear = new Float32Array(capacity);
    this.happiness = new Float32Array(capacity);
    this.energy = new Float32Array(capacity);
    this.health = new Float32Array(capacity);
  }

  clear(): void {
    this.count = 0;
  }

  /**
   * Uma criatura por chamada.
   *
   * Passa por objeto, e não por vinte e cinco argumentos posicionais: com essa
   * quantidade de canais, trocar dois de lugar é um erro que o compilador não
   * pega e que aparece como uma criatura desenhando sono quando está com sede.
   * O objeto some no `push` — o que fica guardado continua sendo o array de
   * números.
   */
  push(row: CreatureRenderRow): void {
    const i = this.count;
    if (i >= this.capacity) return;
    this.id[i] = row.id;
    this.x[i] = row.x;
    this.y[i] = row.y;
    this.prevX[i] = row.prevX;
    this.prevY[i] = row.prevY;
    this.size[i] = row.size;
    this.bodyColor[i] = row.bodyColor;
    this.eyeColor[i] = row.eyeColor;
    this.accentColor[i] = row.accentColor;
    this.dna[i] = row.dna;
    this.species[i] = row.species;
    this.mood[i] = row.mood;
    this.stage[i] = row.stage;
    this.moving[i] = row.moving;
    this.pose[i] = row.pose;
    this.poseTime[i] = row.poseTime;
    this.carrying[i] = row.carrying;
    this.egg[i] = row.egg;
    this.playing[i] = row.playing;
    this.intent[i] = row.intent;
    this.carried[i] = row.carried;
    this.lift[i] = row.lift;
    this.prevLift[i] = row.prevLift;
    this.scar[i] = row.scar;
    this.fear[i] = row.fear;
    this.happiness[i] = row.happiness;
    this.energy[i] = row.energy;
    this.health[i] = row.health;
    this.count = i + 1;
  }
}
