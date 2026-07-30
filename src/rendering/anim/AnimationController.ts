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
  // Nada de marca emocional em animação de LAÇO. O susto tinha uma aqui, e
  // como o estado de medo toca em laço, saía uma interrogação nova a cada volta
  // — uma criatura assustada por dez segundos ficava com uma coluna de
  // interrogações na cabeça, que é a cara de um jogo travado, não de um susto.
  // Partícula de emoção sai UMA vez, e quem a dispara é o jogo, não o laço.
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
  /** O que está tocando veio de fora (um gesto), e não da máquina de estados. */
  private guest = false;

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
    const played = this.animator.play(key, {
      priority: PRIORITY.interaction,
      ...options,
      onFrame: (frame, clip) => this.fire(frame, clip),
    });
    // Quem está tocando agora é de FORA, e o estado espera a vez dele.
    if (played) this.guest = true;
    return played;
  }

  /** O que desenhar agora. */
  view() {
    return this.animator.view();
  }

  /** Chamado a cada quadro do jogo. */
  update(signals: CreatureSignals, dt: number): void {
    const rule = stateFor(signals);
    const from = this.state;

    // O ESTADO NÃO É REFÉM DO PRÓPRIO DESENHO.
    //
    // Quem adia uma troca de estado é um gesto vindo de FORA — o tapa, a
    // palavra dita, a fruta no focinho — e só enquanto ele estiver tocando. A
    // animação do estado anterior, não: ela existe porque aquele estado
    // existia, e no instante em que ele acaba ela perdeu o direito à tela.
    //
    // A prioridade sozinha não sabe fazer essa distinção, e isso deu um
    // defeito real: cair é urgente, o gesto de se levantar ao encostar no chão
    // é rotina, e a queda — que é um LAÇO, nunca termina — recusava a saída
    // pela régua de prioridade. A criatura pousava e continuava caindo para
    // sempre. Por isso a marca `guest`: ela separa "estou tocando o estado" de
    // "estou tocando um pedido de fora".
    if (this.guest && this.animator.finished) this.guest = false;
    const waiting =
      this.guest && !this.animator.finished && this.animator.priority >= rule.priority;
    if (waiting) {
      this.animator.update(dt);
      return;
    }

    const changed = rule.state !== this.state;
    if (changed) {
      this.state = rule.state;
      // A TRAVESSIA: primeiro a animação de entrada, uma vez só, e depois o
      // laço do estado. É o que impede o pulo seco entre andar e parar.
      const enter = rule.enter?.(signals, from) ?? null;
      if (enter && this.options.has(enter)) {
        this.animator.interrupt(enter, {
          priority: rule.priority,
          crossfade: CROSSFADE,
          onFrame: (frame, clip) => this.fire(frame, clip),
        });
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

    if (changed) {
      this.animator.interrupt(wanted, {
        loop: true,
        priority: rule.priority,
        crossfade: CROSSFADE,
        onFrame: (frame, clip) => this.fire(frame, clip),
      });
    } else if (playing !== wanted) {
      // O MESMO estado pode querer outro desenho: no colo, a mão que acelera
      // troca "aninhada" por "sacudida" sem que o estado mude.
      this.animator.play(wanted, {
        loop: true,
        priority: rule.priority,
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
          // Ela entra como HÓSPEDE, igual a um gesto: é de uma vez só, e tem
          // direito de terminar antes de o laço do ocioso voltar. Quando acaba,
          // o laço volta sozinho, porque o desenho pedido deixou de ser este.
          const played = this.animator.play(filler, {
            priority: rule.priority,
            crossfade: CROSSFADE,
            onFrame: (frame, clip) => this.fire(frame, clip),
          });
          if (played) this.guest = true;
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
