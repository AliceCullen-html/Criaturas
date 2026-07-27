import { Rectangle, Texture } from 'pixi.js';
import sheetUrl from '../../assets/tintim.png';

/**
 * A FOLHA DE SPRITES DO TINTIM.
 *
 * Desenhada à mão, 512×192, oito colunas por três linhas de células de 64×64.
 * Dentro de cada célula o desenho tem 16×16 pixels de verdade, ampliados
 * quatro vezes — verificado pixel a pixel: a folha é um upscale 4× exato, sem
 * meio-tom nem antialiasing. Por isso a leitura aqui **desfaz a ampliação** e
 * guarda os 16×16 originais. Redesenhar a partir do original e ampliar por um
 * número inteiro é o que mantém o pixel quadrado; usar a célula de 64 e
 * encolher por um fator quebrado borraria a arte que ela veio trazer.
 *
 * A paleta é a do ZX Spectrum, chapada: amarelo, vermelho, branco, preto,
 * ciano, magenta e um azul que só aparece nas lágrimas.
 */

/** Lado do desenho de verdade, em pixels. */
export const ART = 16;
/** Lado da célula na folha (o desenho ampliado 4×). */
const CELL = 64;
const COLS = 8;
const COUNT = 20;

/**
 * Os vinte quadros, na ordem em que estão na folha.
 *
 * Os nomes vêm da ficha que acompanha o desenho. `normal` não existe como
 * quadro próprio: é o `idle`, como na ficha original.
 */
export const FRAME = {
  idle: 0,
  walk1: 1,
  walk2: 2,
  walk3: 3,
  walk4: 4,
  run1: 5,
  run2: 6,
  jump: 7,
  /** As bolinhas das antenas apagam por um instante: é o "ativar". */
  activate: 8,
  push: 9,
  carry: 10,
  /** Pupilas para fora: olhando para o lado. */
  look: 11,
  surprised: 12,
  happy: 13,
  curious: 14,
  /** Lágrimas azuis. */
  sad: 15,
  angry: 16,
  afraid: 17,
  sleeping: 18,
  /** Olhos de coração. */
  loved: 19,
} as const;

export type FrameId = (typeof FRAME)[keyof typeof FRAME];

/** Ciclos de andar e correr, na ordem em que se alternam. */
export const WALK_CYCLE: readonly number[] = [FRAME.walk1, FRAME.walk2, FRAME.walk3, FRAME.walk4];
export const RUN_CYCLE: readonly number[] = [FRAME.run1, FRAME.run2];

/**
 * Índice do humor vindo da simulação. Cópia local do que a simulação escreve
 * no buffer — o renderer não importa a simulação, e nunca importou.
 */
const MOOD_FRAME: readonly number[] = [
  FRAME.idle, // neutro
  FRAME.happy,
  FRAME.sad, // carente
  FRAME.sleeping,
  FRAME.surprised,
  FRAME.angry,
  FRAME.sad,
  FRAME.loved,
  FRAME.afraid,
  FRAME.curious,
  FRAME.surprised, // faminta: boca aberta
  FRAME.surprised, // com sede
  FRAME.happy, // brincalhona
];

/** Poses que têm quadro próprio na folha. As outras deixam o humor falar. */
const POSE_HURT = 18;
const POSE_SIT = 3;
const POSE_LIE = 4;
const POSE_LOOK_UP = 5;
const POSE_LOOK_DOWN = 8;
const POSE_LISTEN = 7;
const POSE_PONDER = 14;
const POSE_PLAY = 15;
const POSE_PERK = 16;
const POSE_DIG = 12;
const POSE_STRETCH = 2;

/** Acima disto o passo vira corrida, em pixels de mundo por segundo. */
export const RUN_SPEED = 42;

export interface FrameChoice {
  mood: number;
  pose: number;
  moving: boolean;
  /** Velocidade em px/s, para separar andar de correr. */
  speed: number;
  /** Carregando alguma coisa na boca. */
  carrying: boolean;
  /** Relógio do ciclo de passos desta criatura. */
  step: number;
}

/**
 * Qual dos vinte quadros mostrar.
 *
 * A ordem das perguntas é a ordem de importância do que está acontecendo: dor
 * primeiro, depois sono, depois o que ela está FAZENDO com o corpo, depois o
 * andar, e só então o humor. É a mesma hierarquia que o jogo já usava quando o
 * rosto era desenhado por cima do corpo — a pose conta a ocupação, o rosto
 * conta a emoção —, agora resolvida num quadro só, porque é assim que a folha
 * foi desenhada.
 */
export function frameFor(choice: FrameChoice): number {
  const { mood, pose, moving, speed, carrying, step } = choice;

  if (pose === POSE_HURT) return FRAME.sad;
  if (pose === POSE_LIE || pose === POSE_SIT) return FRAME.sleeping;
  if (mood === 3 && !moving) return FRAME.sleeping; // humor sonolento

  if (carrying) return FRAME.carry;

  if (moving) {
    // Correr é passo rápido. As criaturas andam entre 20 e 52 px/s conforme o
    // genoma, então o corte fica em 42: a maioria caminha, e só as ligeiras —
    // ou quem está fugindo — entram no ciclo de corrida.
    const cycle = speed > RUN_SPEED ? RUN_CYCLE : WALK_CYCLE;
    return cycle[Math.floor(step) % cycle.length]!;
  }

  // Parada, o gesto em curso manda no quadro.
  switch (pose) {
    case POSE_LOOK_UP:
    case POSE_LOOK_DOWN:
    case POSE_LISTEN:
      return FRAME.look;
    case POSE_PONDER:
      return FRAME.curious;
    case POSE_PLAY:
    case POSE_PERK:
      return FRAME.happy;
    case POSE_DIG:
      return FRAME.push;
    case POSE_STRETCH:
      return FRAME.jump;
    default:
      break;
  }

  return MOOD_FRAME[mood] ?? FRAME.idle;
}

/**
 * Recorta a folha em vinte texturas de 16×16.
 *
 * As células são copiadas para uma tira única (320×16) com a interpolação
 * desligada, e cada quadro vira um recorte dessa tira. Uma textura só, vinte
 * recortes: o Pixi desenha o rebanho inteiro numa levada de GPU.
 */
export async function loadTintimFrames(): Promise<Texture[]> {
  const image = new Image();
  image.src = sheetUrl;
  await image.decode();

  const strip = document.createElement('canvas');
  strip.width = ART * COUNT;
  strip.height = ART;
  const ctx = strip.getContext('2d');
  if (!ctx) throw new Error('Tintim: contexto 2D indisponível para recortar a folha.');
  ctx.imageSmoothingEnabled = false;

  for (let i = 0; i < COUNT; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    ctx.drawImage(image, col * CELL, row * CELL, CELL, CELL, i * ART, 0, ART, ART);
  }

  const source = Texture.from(strip).source;
  source.scaleMode = 'nearest';
  return Array.from(
    { length: COUNT },
    (_, i) => new Texture({ source, frame: new Rectangle(i * ART, 0, ART, ART) }),
  );
}
