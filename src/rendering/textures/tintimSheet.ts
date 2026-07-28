import { EGG_CRACK_AT } from '@core';
import { Rectangle, Texture } from 'pixi.js';
import playUrl from '../../assets/anim/play.png';
import sheetUrl from '../../assets/tintim.png';

/**
 * A FOLHA DE SPRITES DO TINTIM.
 *
 * Desenhada à mão, 512×512, oito colunas por oito linhas de células de 64×64.
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
/**
 * Quadros que a folha traz: os quarenta e três da criatura de frente, os sete
 * do começo da vida (seis do nascimento e o ovo parado) e os doze das outras
 * quatro direções.
 */
const COUNT = 62;
/** Destes o jogo já sabe o significado. */
export const NAMED = 20;

/**
 * Os vinte quadros, na ordem em que estão na folha.
 *
 * Os nomes vêm da ficha que acompanha o desenho. `normal` não existe como
 * quadro próprio: é o `idle`, como na ficha original.
 */
export const FRAME = {
  // --- Movimento (linha 0) ---
  idle: 0,
  walk1: 1,
  walk2: 2,
  walk3: 3,
  walk4: 4,
  run1: 5,
  run2: 6,
  jump: 7,
  // --- Ações (linha 1) ---
  /** As bolinhas das antenas apagam por um instante: é o "ativar". */
  activate: 8,
  push: 9,
  carry: 10,
  /** Pupilas para fora: olhando para o lado. */
  look: 11,
  surprised: 12,
  // --- Emoções ---
  happy: 13,
  curious: 14,
  /** Lágrimas azuis. */
  sad: 15,
  angry: 16,
  afraid: 17,
  sleeping: 18,
  /** Olhos de coração. */
  loved: 19,
  // --- Animações da folha nova (linhas 3 a 5) ---
  /** O outro tempo da respiração: o corpo inteiro desce um pixel. */
  breatheOut: 20,
  /** Olhos fechados por um instante — diferente de dormir. */
  blink: 21,
  wave1: 22,
  wave2: 23,
  dance1: 24,
  dance2: 25,
  /** Boca aberta e boca fechada: a criatura falando. */
  talk1: 26,
  talk2: 27,
  cheer1: 28,
  cheer2: 29,
  /** Pupilas para a esquerda e para a direita. */
  lookLeft: 30,
  lookRight: 31,
  sit: 32,
  eat1: 33,
  eat2: 34,
  /** Olhos arregalados de susto. */
  startled: 35,
  fall1: 36,
  dizzy1: 37,
  dizzy2: 38,
  dizzy3: 39,
  fall2: 40,
  fall3: 41,
  /** Um quadro a mais que veio com a folha do ovo, ainda sem uso. */
  spare: 42,
  // --- O começo da vida (linha 6) ---
  /**
   * O ovo intacto e o ovo rachando.
   *
   * Os seis quadros de 43 a 48 são UMA animação em ordem: casca inteira,
   * primeira rachadura, casca partida, a cabeça amarela aparecendo, a criatura
   * saindo dos cacos e, enfim, ela de pé. É o único ciclo da folha que não dá
   * a volta — nascer acontece uma vez.
   */
  hatch1: 43,
  hatch2: 44,
  hatch3: 45,
  hatch4: 46,
  hatch5: 47,
  hatch6: 48,
  /** O ovo parado, esperando. */
  egg: 49,
} as const;

/**
 * BRINCANDO COM A BOLA — os cinco quadros da segunda folha.
 *
 * Vêm de outro arquivo, e por isso continuam depois dos sessenta e dois da
 * folha principal. A folha traz pares (criatura, bola) lado a lado, porque na
 * ficha os dois aparecem juntos; aqui só a metade da CRIATURA é recortada — a
 * bola tem física e desenho próprios, e precisa estar onde a física a puser,
 * não onde o desenho a colou.
 */
export const PLAY_FRAME = {
  look: 62,
  push: 63,
  jump: 64,
  hug: 65,
  chase: 66,
} as const;

/**
 * AS OITO DIREÇÕES, EM CINCO DESENHOS.
 *
 * O mundo é isométrico, então uma criatura pode ir para oito lados — e a folha
 * traz cinco: SUL (de frente, que é o resto da folha inteira), SUDESTE, LESTE,
 * NORDESTE e NORTE. As quatro que faltam são o espelho horizontal das quatro da
 * direita, e o espelho é de graça: o renderer já virava o sprite para a
 * esquerda desde sempre.
 *
 * Cinco desenhos em vez de oito não é economia de trabalho — é o que mantém a
 * arte consistente. Oito conjuntos desenhados à mão divergem: a criatura muda
 * de tamanho ou de cor ao virar, e o olho pega isso na hora.
 *
 * De costas o rosto some e aparece a costura ciana do macacão; de perfil sobra
 * um olho e o narizinho para fora. É por esses dois detalhes que se enxerga
 * para onde ela vai, mesmo de longe.
 */
export const FACING = {
  s: 0,
  se: 1,
  e: 2,
  ne: 3,
  n: 4,
} as const;

/** O quadro de cada conjunto quando ela está parada naquela direção. */
const FACING_IDLE: readonly number[] = [FRAME.idle, 50, 53, 56, 59];

/**
 * O ciclo de passos de cada direção.
 *
 * De frente são os quatro quadros que a folha sempre teve; nas outras quatro
 * direções são três — o desenho parado e os dois passos. Três quadros bastam:
 * o que faz ler como caminhada é o ciclo avançar com a DISTÂNCIA percorrida, e
 * não a quantidade de desenhos.
 */
const FACING_WALK: readonly (readonly number[])[] = [
  [FRAME.walk1, FRAME.walk2, FRAME.walk3, FRAME.walk4],
  [50, 51, 52],
  [53, 54, 55],
  [56, 57, 58],
  [59, 60, 61],
];

/** Para onde ela vai, medido em coordenadas de TELA, e se o desenho espelha. */
export interface Heading {
  /** Índice em `FACING`. */
  facing: number;
  /** Vai para a esquerda: o mesmo desenho, virado. */
  mirror: boolean;
}

const HEADING_S: Heading = { facing: FACING.s, mirror: false };

/**
 * A direção do movimento vira um dos cinco desenhos (e talvez um espelho).
 *
 * O vetor chega em coordenadas de TELA — quem projeta é o renderer, e este
 * módulo não sabe o que é isometria. Oito fatias de 45 graus a partir do
 * leste, no sentido horário da tela: L, SE, S, SO, O, NO, N, NE.
 */
export function headingOf(screenDx: number, screenDy: number): Heading {
  if (screenDx === 0 && screenDy === 0) return HEADING_S;
  const angle = Math.atan2(screenDy, screenDx);
  // Fatia de 45°, deslocada de meia fatia para o leste ficar no MEIO da sua.
  const slice = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  switch (slice) {
    case 0:
      return { facing: FACING.e, mirror: false };
    case 1:
      return { facing: FACING.se, mirror: false };
    case 2:
      return HEADING_S;
    case 3:
      return { facing: FACING.se, mirror: true };
    case 4:
      return { facing: FACING.e, mirror: true };
    case 5:
      return { facing: FACING.ne, mirror: true };
    case 6:
      return { facing: FACING.n, mirror: false };
    default:
      return { facing: FACING.ne, mirror: false };
  }
}

/** O quadro do passo naquela direção, dado o relógio de passos da criatura. */
export function walkFrame(facing: number, step: number): number {
  const cycle = FACING_WALK[facing] ?? FACING_WALK[FACING.s]!;
  return cycle[Math.floor(step) % cycle.length]!;
}

/** O quadro parado naquela direção. */
export function idleFrame(facing: number): number {
  return FACING_IDLE[facing] ?? FRAME.idle;
}

export type FrameId = (typeof FRAME)[keyof typeof FRAME];

/**
 * Os CICLOS.
 *
 * Um quadro parado é uma pose; dois ou três alternados é uma criatura viva. A
 * folha veio com estes ciclos prontos, e é deles que sai quase tudo o que se
 * enxerga de vida: a respiração de fundo, a conversa, a dança, o cambaleio.
 */
export const WALK_CYCLE: readonly number[] = [FRAME.walk1, FRAME.walk2, FRAME.walk3, FRAME.walk4];
export const RUN_CYCLE: readonly number[] = [FRAME.run1, FRAME.run2];
/** Respirar: o jardim inteiro sobe e desce um pixel, cada um no seu tempo. */
export const BREATHE: readonly number[] = [FRAME.idle, FRAME.breatheOut];
export const WAVE: readonly number[] = [FRAME.idle, FRAME.wave1, FRAME.wave2, FRAME.wave1];
export const DANCE: readonly number[] = [FRAME.dance1, FRAME.idle, FRAME.dance2, FRAME.idle];
export const TALK: readonly number[] = [FRAME.talk1, FRAME.talk2];
export const CHEER: readonly number[] = [FRAME.cheer1, FRAME.cheer2];
export const LOOK_AROUND: readonly number[] = [
  FRAME.lookLeft,
  FRAME.look,
  FRAME.lookRight,
  FRAME.look,
];
export const EAT: readonly number[] = [FRAME.eat1, FRAME.eat2];
export const FALL: readonly number[] = [FRAME.fall1, FRAME.fall2, FRAME.fall3];
export const DIZZY: readonly number[] = [FRAME.dizzy1, FRAME.dizzy2, FRAME.dizzy3];
/**
 * NASCER. Não é um ciclo: é uma linha do tempo.
 *
 * Os outros ciclos dão a volta porque respirar, andar e dançar se repetem.
 * Este vai do ovo inteiro à criatura de pé e para ali — e é por isso que o
 * renderer o percorre pelo PROGRESSO da eclosão, não por um relógio.
 */
export const HATCH: readonly number[] = [
  FRAME.hatch1,
  FRAME.hatch2,
  FRAME.hatch3,
  FRAME.hatch4,
  FRAME.hatch5,
  FRAME.hatch6,
];

/**
 * O quadro do ovo, dado o quanto falta para nascer (0 = recém-posto, 1 = saiu).
 *
 * Onde a rachadura começa é combinado com a simulação em `@core`: ela precisa
 * do mesmo número para saber quanto tempo dura o "abrir agora" de um clique.
 */
export function eggFrame(progress: number): number {
  if (progress < EGG_CRACK_AT) return FRAME.egg;
  const t = (progress - EGG_CRACK_AT) / (1 - EGG_CRACK_AT);
  return HATCH[Math.min(HATCH.length - 1, Math.floor(t * HATCH.length))]!;
}

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

/**
 * Cada microcomportamento vira uma ANIMAÇÃO, não um quadro parado.
 *
 * São dezenove gestos ociosos, e a folha nova trouxe ciclos com nome: acenar,
 * dançar, falar, cambalear, cair, comer, sentar, olhar em volta. Casar os dois
 * é o que transforma "se coçar" e "cheirar uma flor" — que antes eram o mesmo
 * desenho parado com um tremidinho diferente — em dois gestos que qualquer um
 * distingue de longe.
 *
 * O ciclo de um quadro só é legítimo: sentar é sentar, não tem tempo dois.
 *
 * Índices espelham `POSE` em @core — o renderer não importa o núcleo da
 * simulação, mas os dois combinaram este vocabulário.
 */
const POSE_CYCLE: readonly (readonly number[])[] = [
  BREATHE, // 0 nada — respira
  WAVE, // 1 se coça: a mão sobe até a cabeça
  CHEER, // 2 espreguiça: estica os braços para cima
  [FRAME.sit], // 3 senta
  [FRAME.sleeping], // 4 deita
  LOOK_AROUND, // 5 olha o céu
  EAT, // 6 cheira uma flor: abaixa e chega o rosto
  LOOK_AROUND, // 7 para e escuta
  LOOK_AROUND, // 8 olha a água
  DIZZY, // 9 se sacode: o corpo inteiro balança
  FALL, // 10 rola no chão
  EAT, // 11 se limpa: leva a mão ao rosto
  [FRAME.push], // 12 cava
  FALL, // 13 escorrega
  [FRAME.curious], // 14 fica pensando
  DANCE, // 15 brinca com uma folha
  CHEER, // 16 se anima do nada
  BREATHE, // 17 suspira
  [FRAME.sad], // 18 encolhida de dor
];

const POSE_NONE = 0;
const POSE_HURT = 18;
const POSE_LIE = 4;

/** Acima disto o passo vira corrida, em pixels de mundo por segundo. */
export const RUN_SPEED = 42;

/** Tempos por segundo: a respiração é lenta, o gesto é mais vivo. */
const BREATH_SPEED = 1.1;
const GESTURE_SPEED = 3.4;

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
  /**
   * Relógio contínuo desta criatura, em segundos, com uma defasagem própria.
   * É o que faz cada uma respirar no seu tempo em vez de o jardim inteiro
   * inflar e desinflar em uníssono — que seria pior que não respirar.
   */
  breath: number;
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
  const { mood, pose, moving, speed, carrying, step, breath } = choice;

  if (pose === POSE_HURT) return FRAME.sad;
  if (pose === POSE_LIE) return FRAME.sleeping;
  if (mood === 3 && !moving) return FRAME.sleeping; // humor sonolento

  if (carrying) return FRAME.carry;

  if (moving) {
    // Correr é passo rápido. As criaturas andam entre 20 e 52 px/s conforme o
    // genoma, então o corte fica em 42: a maioria caminha, e só as ligeiras —
    // ou quem está fugindo — entram no ciclo de corrida.
    const cycle = speed > RUN_SPEED ? RUN_CYCLE : WALK_CYCLE;
    return cycle[Math.floor(step) % cycle.length]!;
  }

  // Parada, o gesto em curso vira uma animação inteira, não um quadro só.
  if (pose !== POSE_NONE) {
    const cycle = POSE_CYCLE[pose] ?? BREATHE;
    return cycle[Math.floor(breath * GESTURE_SPEED) % cycle.length]!;
  }

  // Sem gesto, o humor fala — e, no humor neutro, ela RESPIRA. É a diferença
  // entre um jardim de bonecos e um jardim de bichos parados: nenhum deles
  // está fazendo nada, e mesmo assim todos estão vivos.
  const frame = MOOD_FRAME[mood] ?? FRAME.idle;
  if (frame !== FRAME.idle) return frame;
  return BREATHE[Math.floor(breath * BREATH_SPEED) % BREATHE.length]!;
}

/**
 * Recorta a folha em vinte texturas de 16×16.
 *
 * As células são copiadas para uma tira única (320×16) com a interpolação
 * desligada, e cada quadro vira um recorte dessa tira. Uma textura só, vinte
 * recortes: o Pixi desenha o rebanho inteiro numa levada de GPU.
 */
/**
 * Os cinco quadros de brincar, tirados dos pares da folha de animação.
 *
 * Os pares são (criatura, bola), (criatura, bola)... — só os índices pares
 * interessam.
 */
export async function loadPlayFrames(): Promise<Texture[]> {
  const image = new Image();
  image.src = playUrl;
  await image.decode();

  const count = 5;
  const strip = document.createElement('canvas');
  strip.width = ART * count;
  strip.height = ART;
  const ctx = strip.getContext('2d');
  if (!ctx) throw new Error('Tintim: contexto 2D indisponível para os quadros de brincar.');
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < count; i++) {
    // Índice par: a metade da criatura de cada par.
    ctx.drawImage(image, i * 2 * CELL, 0, CELL, CELL, i * ART, 0, ART, ART);
  }
  const source = Texture.from(strip).source;
  source.scaleMode = 'nearest';
  return Array.from(
    { length: count },
    (_unused, i) => new Texture({ source, frame: new Rectangle(i * ART, 0, ART, ART) }),
  );
}

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
