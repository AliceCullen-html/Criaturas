/**
 * O ANIMADOR.
 *
 * Uma criatura tem um destes. Ele não sabe desenhar, não conhece o Pixi e não
 * conhece o jogo: recebe pedidos ("toque `caminhar` em laço", "enfileire
 * `mastigar` e depois `engolir`"), roda um relógio e responde QUAL animação e
 * QUAL quadro devem aparecer agora — mais a mistura, quando está atravessando
 * de uma para outra.
 *
 * É de propósito que ele seja burro e puro. Todo o resto do sistema de
 * animação — a máquina de estados, as partículas, o som — se apoia nisto, e
 * uma peça que não depende de nada pode ser testada de verdade, quadro a
 * quadro, sem abrir uma janela.
 *
 * O QUE ELE FAZ:
 *
 *   play      — toca agora, respeitando prioridade
 *   queue     — entra na fila e toca quando a atual acabar
 *   interrupt — corta o que estiver tocando, fila inclusive
 *   loop      — em laço ou uma vez só
 *   reverse   — de trás para frente
 *   pause/resume
 *   speed     — multiplicador de velocidade
 *   frame events + callbacks
 *   crossfade — a travessia macia entre duas animações
 *
 * PRIORIDADE é a regra que evita o pior defeito de um sistema assim: a
 * animação de piscar cortando a de morrer. Um pedido só toma o lugar do que
 * está tocando se tiver prioridade MAIOR OU IGUAL; abaixo disso ele é
 * descartado (ou vai para a fila, se quem pediu quis isso).
 */

/** Um pedido de animação. */
export interface PlayOptions {
  /** Em laço? Por padrão, não. */
  loop?: boolean;
  /** De trás para frente? */
  reverse?: boolean;
  /** Multiplicador de velocidade (1 = o tempo da ficha). */
  speed?: number;
  /**
   * Quem manda mais. Igual ou maior toma o lugar; menor é ignorado.
   * A escala é do jogo, não do motor — ver `PRIORITY` na máquina de estados.
   */
  priority?: number;
  /** Segundos de travessia macia a partir do que estava tocando. */
  crossfade?: number;
  /** Chamado quando a animação termina (não vale para laço). */
  onEnd?: () => void;
  /** Chamado ao ENTRAR em cada quadro: `(quadro, chave)`. */
  onFrame?: (frame: number, key: string) => void;
}

interface Playing {
  key: string;
  frames: number;
  fps: number;
  loop: boolean;
  reverse: boolean;
  speed: number;
  priority: number;
  time: number;
  /** Último quadro anunciado, para os eventos saírem uma vez só. */
  announced: number;
  done: boolean;
  onEnd?: (() => void) | undefined;
  onFrame?: ((frame: number, key: string) => void) | undefined;
}

/** O que o desenho precisa saber para pôr a criatura na tela. */
export interface AnimationView {
  key: string;
  frame: number;
  /** A animação de onde estamos saindo, enquanto a travessia dura. */
  fadingKey: string | null;
  fadingFrame: number;
  /** 0 = ainda toda na anterior, 1 = já toda na nova. */
  blend: number;
}

/** Quantos quadros por segundo uma animação toca, se ninguém disser outra coisa. */
export const DEFAULT_FPS = 8;

export interface AnimatorOptions {
  /** Quantos quadros tem cada animação, por chave. */
  frameCount: (key: string) => number;
  /** E a que velocidade cada uma toca. */
  fps?: ((key: string) => number) | undefined;
}

export class Animator {
  private current: Playing | null = null;
  private pending: Array<{ key: string; options: PlayOptions }> = [];
  private fading: { key: string; frame: number } | null = null;
  private fadeLeft = 0;
  private fadeTotal = 0;
  private paused = false;
  private rate = 1;

  constructor(private readonly options: AnimatorOptions) {}

  /** A animação tocando agora, ou null. */
  get playing(): string | null {
    return this.current?.key ?? null;
  }

  get priority(): number {
    return this.current?.priority ?? -Infinity;
  }

  get finished(): boolean {
    return this.current === null || this.current.done;
  }

  get queued(): readonly string[] {
    return this.pending.map((item) => item.key);
  }

  /** Multiplicador global — o "câmera lenta" de todas as animações desta criatura. */
  setRate(rate: number): void {
    this.rate = Math.max(0, rate);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Toca agora, se tiver direito.
   *
   * Devolve se o pedido pegou — quem pediu pode querer saber que foi negado
   * (um gesto de carinho recusado por uma criatura que está morrendo, por
   * exemplo, não deve nem tocar o som).
   */
  play(key: string, options: PlayOptions = {}): boolean {
    const priority = options.priority ?? 0;
    const current = this.current;
    if (current && !current.done && priority < current.priority) return false;
    // A MESMA animação em laço não recomeça: pedir "caminhar" a cada quadro
    // enquanto ela anda é o caso normal, e reiniciar congelaria o passo no
    // primeiro quadro para sempre.
    if (
      current &&
      !current.done &&
      current.key === key &&
      current.loop &&
      (options.loop ?? false)
    ) {
      current.speed = options.speed ?? current.speed;
      return true;
    }

    const fade = options.crossfade ?? 0;
    if (fade > 0 && current) {
      this.fading = { key: current.key, frame: this.frameOf(current) };
      this.fadeLeft = fade;
      this.fadeTotal = fade;
    }

    this.current = {
      key,
      frames: Math.max(1, this.options.frameCount(key)),
      fps: this.options.fps?.(key) ?? DEFAULT_FPS,
      loop: options.loop ?? false,
      reverse: options.reverse ?? false,
      speed: options.speed ?? 1,
      priority,
      time: 0,
      announced: -1,
      done: false,
      onEnd: options.onEnd,
      onFrame: options.onFrame,
    };
    return true;
  }

  /** Entra na fila: toca quando a atual terminar. */
  queue(key: string, options: PlayOptions = {}): void {
    if (!this.current || this.current.done) {
      this.play(key, options);
      return;
    }
    this.pending.push({ key, options });
  }

  /** Corta tudo — o que está tocando e o que estava esperando. */
  interrupt(key: string, options: PlayOptions = {}): void {
    this.pending.length = 0;
    this.current = null;
    this.play(key, options);
  }

  /** Esvazia só a fila; o que está tocando termina. */
  clearQueue(): void {
    this.pending.length = 0;
  }

  /** Roda o relógio. */
  update(dt: number): void {
    if (this.fadeLeft > 0) this.fadeLeft = Math.max(0, this.fadeLeft - dt);
    if (this.fadeLeft === 0) this.fading = null;

    const current = this.current;
    if (!current || this.paused) return;

    const step = dt * this.rate * current.speed;
    if (step <= 0) return;

    if (!current.done) {
      current.time += step;
      const raw = current.time * current.fps;
      if (!current.loop && raw >= current.frames) {
        current.time = (current.frames - 0.0001) / current.fps;
      }
      // Os eventos de quadro saem UMA vez por quadro entrado, mesmo que o
      // relógio pule dois de uma vez num quadro pesado.
      const frame = this.frameOf(current);
      if (frame !== current.announced) {
        current.announced = frame;
        current.onFrame?.(frame, current.key);
      }
      if (!current.loop && raw >= current.frames - 0.0001) {
        current.done = true;
        current.onEnd?.();
        const next = this.pending.shift();
        if (next) this.play(next.key, next.options);
      }
    }
  }

  /** O que desenhar agora. */
  view(): AnimationView | null {
    const current = this.current;
    if (!current) return null;
    return {
      key: current.key,
      frame: this.frameOf(current),
      fadingKey: this.fading?.key ?? null,
      fadingFrame: this.fading?.frame ?? 0,
      blend: this.fadeTotal > 0 ? 1 - this.fadeLeft / this.fadeTotal : 1,
    };
  }

  private frameOf(playing: Playing): number {
    const raw = Math.floor(playing.time * playing.fps);
    const index = playing.loop ? raw % playing.frames : Math.min(raw, playing.frames - 1);
    return playing.reverse ? playing.frames - 1 - index : index;
  }
}
