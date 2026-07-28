import { Animator, type PlayOptions } from './Animator';
import {
  FILLER_GAP,
  IDLE_FILLERS,
  PRIORITY,
  stateFor,
  type CreatureSignals,
  type StateName,
} from './states';

/**
 * O CONTROLADOR DE ANIMAÇÃO DE UMA CRIATURA.
 *
 * O animador sabe TOCAR; a máquina de estados sabe O QUE deveria estar
 * tocando. Isto aqui é quem olha para a criatura a cada quadro e junta os
 * dois: descobre o estado, faz a travessia quando ele muda, mantém o laço
 * rodando, enfileira as microanimações do ocioso e avisa o mundo nos quadros
 * marcados.
 *
 * Um por criatura, e nada aqui é específico de nenhuma delas: qualquer bicho
 * que saiba responder `CreatureSignals` ganha o sistema inteiro de graça — é o
 * que o briefing pede quando diz que toda animação tem de ser reutilizável por
 * qualquer criatura.
 */

/** Um evento disparado por um quadro de uma animação. */
export interface FrameEvent {
  clip: string;
  frame: number;
  /** O que sai daqui: 'footstep', 'bite', 'splash', 'bubble'… */
  emit: string;
}

/**
 * OS EVENTOS DE QUADRO, como tabela.
 *
 * Ficam fora do motor e fora da máquina de estados porque são um TERCEIRO
 * assunto: o instante exato em que o som toca, a poeira sai e a fruta diminui.
 * Escritos assim, acrescentar um é acrescentar uma linha — e quem escreve não
 * precisa saber nada de renderização.
 */
export const FRAME_EVENTS: readonly FrameEvent[] = [
  { clip: 'caminhar', frame: 0, emit: 'footstep' },
  { clip: 'caminhar', frame: 3, emit: 'footstep' },
  { clip: 'correr', frame: 0, emit: 'footstep' },
  { clip: 'correr', frame: 2, emit: 'footstep' },
  { clip: 'correr', frame: 4, emit: 'footstep' },
  { clip: 'mastigar', frame: 2, emit: 'bite' },
  { clip: 'engolir', frame: 3, emit: 'swallow' },
  { clip: 'beber', frame: 2, emit: 'sip' },
  { clip: 'sacudirAgua', frame: 1, emit: 'droplets' },
  { clip: 'sacudirAgua', frame: 3, emit: 'droplets' },
  { clip: 'esfregar', frame: 1, emit: 'bubble' },
  { clip: 'esfregar', frame: 4, emit: 'bubble' },
  { clip: 'espuma', frame: 2, emit: 'bubble' },
  { clip: 'chutarBola', frame: 2, emit: 'ballHit' },
  { clip: 'aprender', frame: 3, emit: 'spark' },
  { clip: 'afagar', frame: 2, emit: 'heart' },
  { clip: 'chorarT', frame: 2, emit: 'tear' },
  { clip: 'assustar', frame: 1, emit: 'startle' },
  { clip: 'espirrar', frame: 2, emit: 'sneeze' },
  { clip: 'comemorar', frame: 2, emit: 'star' },
];

/** Índice dos eventos por animação, montado uma vez. */
const eventsByClip = new Map<string, Map<number, string[]>>();
for (const event of FRAME_EVENTS) {
  let byFrame = eventsByClip.get(event.clip);
  if (!byFrame) {
    byFrame = new Map();
    eventsByClip.set(event.clip, byFrame);
  }
  const list = byFrame.get(event.frame) ?? [];
  list.push(event.emit);
  byFrame.set(event.frame, list);
}

export interface ControllerOptions {
  frameCount: (key: string) => number;
  fps?: (key: string) => number;
  /** Existe animação com esta chave? Chaves ausentes caem no ocioso. */
  has: (key: string) => boolean;
  /** Alguém quer saber que um quadro marcado passou. */
  onEvent?: (emit: string) => void;
  /** Sorteio — o jogo passa o seu, para o jardim continuar determinístico. */
  random?: () => number;
}

/** Segundos de travessia entre dois estados. */
const CROSSFADE = 0.12;

export class AnimationController {
  private readonly animator: Animator;
  private state: StateName | null = null;
  private fillerIn: number;
  private lastKey: string | null = null;

  constructor(private readonly options: ControllerOptions) {
    this.animator = new Animator({ frameCount: options.frameCount, fps: options.fps });
    this.fillerIn = this.nextGap();
  }

  get current(): StateName | null {
    return this.state;
  }

  get clip(): string | null {
    return this.animator.playing;
  }

  /** Acesso direto ao motor, para quem quiser pedir uma animação na mão. */
  get engine(): Animator {
    return this.animator;
  }

  /**
   * Uma animação pedida de fora — um gesto do jogador, um acontecimento.
   *
   * É por aqui que "levou um tapa" ou "recebeu um presente" entram: com
   * prioridade de interação, elas passam por cima do estado e o estado volta
   * sozinho quando a animação acaba.
   */
  trigger(key: string, options: PlayOptions = {}): boolean {
    if (!this.options.has(key)) return false;
    return this.animator.play(key, {
      priority: PRIORITY.interaction,
      ...options,
      onFrame: (frame, clip) => this.fire(frame, clip),
    });
  }

  /** O que desenhar agora. */
  view() {
    return this.animator.view();
  }

  /** Chamado a cada quadro do jogo. */
  update(signals: CreatureSignals, dt: number): void {
    const rule = stateFor(signals);
    const changed = rule.state !== this.state;
    const from = this.state;

    if (changed) {
      this.state = rule.state;
      // A TRAVESSIA: primeiro a animação de entrada, uma vez só, e depois o
      // laço do estado. É o que impede o pulo seco entre andar e parar.
      const enter = rule.enter?.(signals, from) ?? null;
      if (enter && this.options.has(enter)) {
        this.animator.play(enter, {
          priority: rule.priority,
          crossfade: CROSSFADE,
          onFrame: (frame, clip) => this.fire(frame, clip),
        });
        this.animator.clearQueue();
        this.animator.queue(this.loopOf(rule, signals), {
          loop: true,
          priority: rule.priority,
          onFrame: (frame, clip) => this.fire(frame, clip),
        });
        this.animator.setRate(rule.rate?.(signals) ?? 1);
        this.animator.update(dt);
        return;
      }
    }

    const wanted = this.loopOf(rule, signals);
    const playing = this.animator.playing;
    const busy = !this.animator.finished && this.animator.priority > rule.priority;

    // Uma animação de uma vez só (um gesto, uma microanimação) está no ar:
    // deixa terminar. O estado espera — é o que evita cortar o bocejo no meio
    // porque a criatura deu um passo.
    if (!busy && (changed || playing !== wanted)) {
      this.animator.play(wanted, {
        loop: true,
        priority: rule.priority,
        crossfade: changed ? CROSSFADE : 0,
        onFrame: (frame, clip) => this.fire(frame, clip),
      });
    }
    this.animator.setRate(rule.rate?.(signals) ?? 1);

    // AS MICROANIMAÇÕES. Só quando ela está ociosa de verdade: ninguém pisca
    // enquanto foge.
    this.fillerIn -= dt;
    if (this.fillerIn <= 0) {
      this.fillerIn = this.nextGap();
      // Só em estado de rotina: ninguém pisca no meio de uma fuga. E com a
      // MESMA autoridade do laço que ela substitui — com autoridade menor o
      // pedido era recusado e a criatura nunca piscava, que foi exatamente o
      // que o teste pegou.
      if (rule.priority <= PRIORITY.idle) {
        const filler = this.pickFiller();
        if (filler) {
          this.animator.play(filler, {
            priority: rule.priority,
            crossfade: CROSSFADE,
            onFrame: (frame, clip) => this.fire(frame, clip),
            onEnd: () => {
              this.animator.play(wanted, { loop: true, priority: rule.priority });
            },
          });
        }
      }
    }

    this.animator.update(dt);
  }

  private loopOf(rule: ReturnType<typeof stateFor>, signals: CreatureSignals): string {
    const key = rule.clip(signals);
    return this.options.has(key) ? key : 'idle';
  }

  private pickFiller(): string | null {
    const random = this.options.random ?? Math.random;
    const usable = IDLE_FILLERS.filter((key) => this.options.has(key) && key !== this.lastKey);
    if (usable.length === 0) return null;
    const key = usable[Math.floor(random() * usable.length)] ?? usable[0]!;
    this.lastKey = key;
    return key;
  }

  private nextGap(): number {
    const random = this.options.random ?? Math.random;
    return FILLER_GAP[0] + random() * (FILLER_GAP[1] - FILLER_GAP[0]);
  }

  private fire(frame: number, clip: string): void {
    const emits = eventsByClip.get(clip)?.get(frame);
    if (!emits || !this.options.onEvent) return;
    for (const emit of emits) this.options.onEvent(emit);
  }
}
