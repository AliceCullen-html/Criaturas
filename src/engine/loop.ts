export interface LoopCallbacks {
  /** Avança a simulação um passo lógico de duração fixa. */
  step(dt: number): void;
  /** Desenha o quadro. `alpha` em [0,1) é o fator de interpolação entre passos. */
  render(alpha: number): void;
}

export interface LoopControls {
  /** Multiplicador de velocidade: 0 = pausado, 1 = normal, 2, 4... */
  getSpeed(): number;
}

// Evita a "espiral da morte" quando a aba fica em segundo plano ou trava.
const MAX_FRAME_SECONDS = 0.25;
const MAX_STEPS_PER_FRAME = 240;

/**
 * Loop com timestep fixo desacoplado do render.
 *
 * A lógica avança em passos de `fixedDt` (determinístico), enquanto o render
 * roda por quadro (60fps) recebendo um `alpha` para interpolar posições. A
 * velocidade escala quantos passos fixos são consumidos por segundo real, sem
 * alterar o dt — preservando o determinismo.
 */
export class SimulationLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  constructor(
    private readonly fixedDt: number,
    private readonly callbacks: LoopCallbacks,
    private readonly controls: LoopControls,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;

    const elapsed = Math.min((now - this.lastTime) / 1000, MAX_FRAME_SECONDS);
    this.lastTime = now;

    const speed = this.controls.getSpeed();
    this.accumulator += elapsed * speed;

    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < MAX_STEPS_PER_FRAME) {
      this.callbacks.step(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps += 1;
    }

    const alpha = speed > 0 ? this.accumulator / this.fixedDt : 0;
    this.callbacks.render(alpha);

    this.rafId = requestAnimationFrame(this.frame);
  };
}
