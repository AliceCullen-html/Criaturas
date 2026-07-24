import { Container, Graphics } from 'pixi.js';

const OUTLINE_COLOR = 0x171922;
const EYE_WHITE = 0xf4f4fb;
const BREATHE_SPEED = 2.2;
const BLINK_INTERVAL_MIN = 2;
const BLINK_INTERVAL_MAX = 6;
const BLINK_DURATION = 0.12;

/**
 * Representação visual procedural de uma criatura: corpo (elipse) + dois olhos
 * que apontam para a direção do movimento, com animação idle de respiração e
 * piscar. Reutilizável via pool — nunca recriada por quadro.
 */
export class CreatureView {
  readonly container = new Container();
  /** Marca de "visto neste quadro" — usado pelo pool para reciclar. */
  seenFrame = 0;
  private readonly body = new Graphics();
  private readonly eyes = new Container();
  private readonly eyeLeft = new Graphics();
  private readonly eyeRight = new Graphics();

  private drawnSize = -1;
  private drawnBody = -1;
  private drawnEyeSize = -1;
  private drawnEyeColor = -1;
  private facing = 0;
  private breathe = Math.random() * 10;
  private blinkCountdown = BLINK_INTERVAL_MIN;
  private blinking = 0;

  constructor() {
    this.eyes.addChild(this.eyeLeft, this.eyeRight);
    this.container.addChild(this.body, this.eyes);
  }

  private redraw(size: number, bodyColor: number, eyeColor: number): void {
    if (size !== this.drawnSize || bodyColor !== this.drawnBody) {
      this.body
        .clear()
        .ellipse(0, 0, size, size * 0.9)
        .fill(bodyColor)
        .stroke({ width: 2, color: OUTLINE_COLOR, alpha: 0.35 });
      this.drawnSize = size;
      this.drawnBody = bodyColor;
    }
    if (size !== this.drawnEyeSize || eyeColor !== this.drawnEyeColor) {
      const eyeR = Math.max(1.6, size * 0.24);
      const pupilR = eyeR * 0.5;
      for (const eye of [this.eyeLeft, this.eyeRight]) {
        eye
          .clear()
          .circle(0, 0, eyeR)
          .fill(EYE_WHITE)
          .circle(eyeR * 0.25, 0, pupilR)
          .fill(eyeColor);
      }
      this.drawnEyeSize = size;
      this.drawnEyeColor = eyeColor;
    }
  }

  update(
    dt: number,
    size: number,
    bodyColor: number,
    eyeColor: number,
    dx: number,
    dy: number,
  ): void {
    this.redraw(size, bodyColor, eyeColor);

    // Direção: aponta para o movimento; se parada, mantém a última direção.
    if (dx * dx + dy * dy > 0.02) {
      const target = Math.atan2(dy, dx);
      let delta = target - this.facing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.facing += delta * Math.min(1, dt * 8);
    }

    // Respiração: leve pulsar vertical do corpo.
    this.breathe += dt * BREATHE_SPEED;
    this.body.scale.set(1, 1 + Math.sin(this.breathe) * 0.06);

    // Olhos apontam para a frente.
    const forwardX = Math.cos(this.facing);
    const forwardY = Math.sin(this.facing);
    const perpX = -forwardY;
    const perpY = forwardX;
    const forward = size * 0.32;
    const sep = size * 0.4;
    this.eyeLeft.position.set(forwardX * forward + perpX * sep, forwardY * forward + perpY * sep);
    this.eyeRight.position.set(forwardX * forward - perpX * sep, forwardY * forward - perpY * sep);

    // Piscar.
    this.blinkCountdown -= dt;
    if (this.blinking > 0) {
      this.blinking -= dt;
      this.eyes.scale.set(1, Math.max(0.08, this.blinking / BLINK_DURATION));
    } else {
      this.eyes.scale.set(1, 1);
      if (this.blinkCountdown <= 0) {
        this.blinking = BLINK_DURATION;
        this.blinkCountdown =
          BLINK_INTERVAL_MIN + Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN);
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
