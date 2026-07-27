import { Application, Container, Graphics, Matrix, Sprite, Text, type Texture } from 'pixi.js';
import {
  POSE,
  TILE,
  WORD_TEXT,
  clamp,
  createRng,
  lerp,
  tileCenterX,
  tileCenterY,
  tileColOf,
  tileCols,
  tileRowOf,
  tileRows,
} from '@core';
import type { CreatureRenderBuffer, RenderBuffer, TileGrid } from '@engine';
import { ART, FRAME, frameFor, loadTintimFrames } from './textures/tintimSheet';
import {
  makeDustTexture,
  makeTileTextures,
  makeLeafTextures,
  makeResourceTextures,
  makeSandTexture,
  makeSceneryTextures,
  makeWaterTextures,
  type SceneryTextures,
} from './textures/world';
import { makeFeedbackTextures, type FeedbackKind } from './textures/feedback';
import { makeHandTextures, type HandState } from './textures/hand';
import { makeAmbientTextures, makeRainTextures } from './textures/ambient';
import { makePropTextures } from './textures/props';
import { GestureRecognizer, type GestureHandlers } from './gestures';
import { ISO_MATRIX, ISO_SQUASH, isoDepth, isoX, isoY, unIso } from './iso';

export interface RendererOptions {
  worldWidth: number;
  worldHeight: number;
}

export interface FrameInput {
  plants: RenderBuffer;
  items: RenderBuffer;
  creatures: CreatureRenderBuffer;
  alpha: number;
  selectedId: number | null;
  /** Todo o grupo selecionado: cada um ganha seu anel no chão. */
  selectedIds: readonly number[];
  followId: number | null;
  /** Ids dos itens, na mesma ordem do buffer `items` (para o hit-test). */
  itemIds: Int32Array;
  /** Bichinhos de ambiente (borboletas, abelhas, pássaros). */
  ambient: readonly AmbientView[];
  /** 0 = tempo bom, 1 = chuva forte. */
  rain: number;
  puddles: ReadonlyArray<{ x: number; y: number; life: number }>;
  /** 0..1 — arco-íris que aparece depois da chuva. */
  rainbow: number;
  /** 0 = dia pleno, 1 = noite fechada. */
  darkness: number;
}

/** O mínimo que o renderer precisa saber sobre um bichinho de ambiente. */
export interface AmbientView {
  kind: number;
  x: number;
  y: number;
  phase: number;
  resting: number;
}

export interface Renderer {
  mount(container: HTMLElement): Promise<void>;
  setTerrain(grid: TileGrid, waterValue: number, seed: number): void;
  setScenery(pieces: readonly ScenerySpot[]): void;
  /** Detalhes do jardim: grama, flores, pedrinhas, troncos, juncos... */
  setProps(props: readonly PropView[]): void;
  /** Onda circular na água, onde o jogador tocou. */
  ripple(x: number, y: number): void;
  /** Faz a árvore tremer quando sacudida. */
  shakeTreeAt(index: number): void;
  /** Quem está dentro do retângulo de seleção (cantos em coordenadas de mundo). */
  creaturesInBox(x1: number, y1: number, x2: number, y2: number): number[];
  setHandlers(handlers: GestureHandlers): void;
  /** Sinal visual acima de uma criatura (coração, gota, estrela...). */
  emit(kind: FeedbackKind, worldX: number, worldY: number): void;
  /** Alguém disse uma palavra: aparece uma bolha com ela por cima da cabeça. */
  say(word: number, worldX: number, worldY: number): void;
  /** Onde a criatura selecionada está NA TELA, para ancorar o cartão. */
  onSelectedScreen(callback: (x: number, y: number, visible: boolean) => void): void;
  frame(input: FrameInput): void;
  destroy(): void;
}

export interface ScenerySpot {
  kind: 'tree' | 'rock' | 'bush' | 'computer';
  /** A casa do tabuleiro em que a peça está plantada. */
  col: number;
  row: number;
  x: number;
  y: number;
  variant: number;
  /** 0 a 1 — uma muda recém-plantada é uma árvore pequena. */
  growth: number;
  /** Só o computador: a palavra que está na tela. */
  word: number;
  /** Só o computador: >0 enquanto alguém estiver aprendendo diante dele. */
  wordTimer: number;
}

/** Um detalhe do jardim, como o renderer precisa vê-lo. */
export interface PropView {
  kind: number;
  x: number;
  y: number;
  variant: number;
  sway: number;
  phase: number;
}

const BACKGROUND_COLOR = 0x2b4a3a;
const SELECTION_COLOR = 0x9be0b4;
const SHADOW_COLOR = 0x101408;
const PIXEL_SCALE = 0.8;
const LEAF_COUNT = 36;
const WATER_FRAME_MS = 220;
/** A que distância abaixo do pé procuramos água, para saber se há reflexo. */
const REFLECTION_PROBE = 18;
/** O reflexo é uma silhueta escura na água, não uma cópia clara dela. */
const REFLECTION_TINT = 0x3a6b92;
const NIGHT_COLOR = 0x131c38;
/** Índice do vaga-lume em @world/ambient. Cópia local: rendering não importa @world. */
const FIREFLY_KIND = 7;
/** Cogumelo luminoso em @world/items. Mesma razão. */
const GLOW_MUSHROOM_VARIANT = 12;
/** Água rasa da margem: mais clara que o fundo do lago. */
const SHALLOW_TINT = 0xb9e2f2;
/** O quanto o arco-íris é achatado em relação a um semicírculo perfeito. */
const RAINBOW_SQUASH = 0.62;

const MOOD = {
  neutral: 0,
  happy: 1,
  needy: 2,
  sleepy: 3,
  surprised: 4,
  angry: 5,
  sad: 6,
  loved: 7,
  afraid: 8,
  curious: 9,
  hungry: 10,
  thirsty: 11,
  playful: 12,
} as const;

/** Como o corpo se mexe em cada estado. Não é só trocar o rosto. */
interface BodyMotion {
  bob: number;
  jitter: number;
  squashX: number;
  squashY: number;
  tilt: number;
  yOffset: number;
}

const motion: BodyMotion = { bob: 0, jitter: 0, squashX: 1, squashY: 1, tilt: 0, yOffset: 0 };

function animateBody(
  mood: number,
  t: number,
  seed: number,
  size: number,
  moving: boolean,
  stage: number,
): BodyMotion {
  // Respiração de base, sempre presente.
  motion.bob = 0;
  motion.jitter = 0;
  motion.squashX = 1;
  motion.squashY = 1 + Math.sin(t * 2.4 + seed) * 0.035;
  motion.tilt = 0;
  motion.yOffset = 0;

  if (moving) {
    // Filhotes dão passinhos rápidos e desajeitados; idosos, lentos.
    const cadence = stage === 0 ? 14 : stage === 2 ? 5.5 : 9;
    const clumsy = stage === 0 ? 1.6 : 1;
    motion.bob = Math.abs(Math.sin(t * cadence + seed)) * size * 0.1 * clumsy;
    motion.tilt = Math.sin(t * cadence + seed) * 0.06 * clumsy;
  }

  switch (mood) {
    case MOOD.happy:
      // Pula e balança o corpo.
      motion.bob += Math.abs(Math.sin(t * 6 + seed)) * size * 0.2;
      motion.tilt += Math.sin(t * 3 + seed) * 0.1;
      break;

    case MOOD.playful: {
      // Gira e dá pulos altos.
      motion.bob += Math.abs(Math.sin(t * 8 + seed)) * size * 0.28;
      motion.tilt += Math.sin(t * 7 + seed) * 0.35;
      break;
    }

    case MOOD.loved:
      motion.bob += Math.abs(Math.sin(t * 5 + seed)) * size * 0.12;
      motion.squashY *= 1.03;
      break;

    case MOOD.afraid:
      // Encolhe e treme.
      motion.jitter = Math.sin(t * 34 + seed) * size * 0.07;
      motion.squashX = 0.86;
      motion.squashY *= 0.88;
      motion.yOffset = size * 0.08;
      break;

    case MOOD.sad:
      // Cabeça baixa: afunda um pouco e inclina para a frente.
      motion.bob *= 0.3;
      motion.squashY *= 0.95;
      motion.yOffset = size * 0.07;
      motion.tilt += 0.08;
      break;

    case MOOD.needy:
      motion.bob *= 0.4;
      motion.tilt += Math.sin(t * 1.6 + seed) * 0.06;
      break;

    case MOOD.curious:
      // Inclina a cabeça e olha para os lados.
      motion.tilt += Math.sin(t * 1.5 + seed) * 0.22;
      motion.bob *= 0.6;
      break;

    case MOOD.angry:
      // Encara: firme, inclinada para a frente, com tremor curto de fúria.
      motion.tilt += 0.05;
      motion.jitter = Math.sin(t * 22 + seed) * size * 0.02;
      motion.squashX = 1.05;
      break;

    case MOOD.hungry:
      // Segura a barriga: encolhe um pouco e balança devagar.
      motion.squashY *= 0.94;
      motion.tilt += Math.sin(t * 2 + seed) * 0.08;
      break;

    case MOOD.thirsty:
      motion.tilt += Math.sin(t * 2.4 + seed) * 0.06;
      motion.yOffset = size * 0.03;
      break;

    case MOOD.sleepy:
      // Respiração lenta e profunda, sentada no chão.
      motion.squashY = 1 + Math.sin(t * 1.4 + seed) * 0.07;
      motion.squashX = 1.06;
      motion.bob = 0;
      motion.yOffset = size * 0.12;
      break;

    case MOOD.surprised:
      motion.bob += size * 0.14;
      motion.squashY *= 1.06;
      break;

    default:
      break;
  }

  return motion;
}

/**
 * Anima o microcomportamento no CORPO.
 *
 * O rosto continua contando a emoção (isso é do `mood`); a pose conta a
 * ocupação. Como só temos translação, rotação e escala, cada gesto é escrito
 * como linguagem corporal: espreguiçar é esticar e inclinar para trás, cheirar
 * é abaixar a frente, escutar é congelar com um tremor de orelha.
 *
 * `t` é o progresso dentro da pose, de 0 a 1.
 */
function animatePose(pose: number, t: number, elapsed: number, size: number, out: BodyMotion): void {
  // Entra e sai suave: sem isto o bicho "estala" para dentro do gesto.
  const ease = Math.min(1, Math.min(t, 1 - t) * 6);

  switch (pose) {
    case POSE.scratch:
      // Pata coçando atrás da orelha: tremor curto e uma leve inclinação.
      out.tilt += 0.13 * ease;
      out.jitter += Math.sin(elapsed * 30) * size * 0.05 * ease;
      break;

    case POSE.stretch: {
      // Alonga: estica para cima, depois relaxa.
      const arc = Math.sin(t * Math.PI);
      out.squashY *= 1 + 0.22 * arc;
      out.squashX *= 1 - 0.1 * arc;
      out.tilt -= 0.18 * arc;
      out.yOffset -= size * 0.1 * arc;
      break;
    }

    case POSE.sit:
      out.squashY *= 1 - 0.16 * ease;
      out.squashX *= 1 + 0.1 * ease;
      out.yOffset += size * 0.16 * ease;
      out.bob *= 0.2;
      break;

    case POSE.lie:
      // Deitada de lado: achata, alarga e tomba.
      out.squashY *= 1 - 0.3 * ease;
      out.squashX *= 1 + 0.18 * ease;
      out.yOffset += size * 0.26 * ease;
      out.tilt += 0.36 * ease;
      out.bob = 0;
      break;

    case POSE.lookUp:
      out.tilt -= 0.26 * ease;
      out.yOffset -= size * 0.05 * ease;
      out.bob *= 0.3;
      break;

    case POSE.sniff:
      // Abaixa a frente até o chão e fareja em pulsos curtos.
      out.tilt += 0.34 * ease;
      out.yOffset += size * 0.14 * ease;
      out.jitter += Math.sin(elapsed * 16) * size * 0.025 * ease;
      break;

    case POSE.listen:
      // Congela. O corpo mal respira e dá tremores curtos de orelha.
      out.bob = 0;
      out.squashY = 1;
      out.tilt += Math.sin(elapsed * 13) * 0.05 * ease;
      break;

    case POSE.lookDown:
      out.tilt += 0.24 * ease;
      out.yOffset += size * 0.1 * ease;
      out.bob *= 0.2;
      break;

    case POSE.shake:
      // Sacode o corpo inteiro, rápido.
      out.tilt += Math.sin(elapsed * 34) * 0.3 * ease;
      out.squashX *= 1 + Math.sin(elapsed * 34) * 0.08 * ease;
      break;

    case POSE.roll:
      // Rola no chão: uma volta completa, achatada.
      out.tilt += t * Math.PI * 2;
      out.squashY *= 1 - 0.2 * ease;
      out.yOffset += size * 0.2 * ease;
      break;

    case POSE.groom:
      // Se cata: cabeça em circulinhos.
      out.tilt += Math.sin(elapsed * 6) * 0.16 * ease;
      out.jitter += Math.cos(elapsed * 6) * size * 0.035 * ease;
      out.yOffset += size * 0.05 * ease;
      break;

    case POSE.dig:
      // Cava: mergulha para a frente em batidas.
      out.tilt += (0.24 + Math.abs(Math.sin(elapsed * 9)) * 0.16) * ease;
      out.yOffset += size * (0.1 + Math.abs(Math.sin(elapsed * 9)) * 0.08) * ease;
      break;

    case POSE.slip: {
      // Escorrega para um lado e se recupera num susto.
      const slip = Math.sin(t * Math.PI);
      out.tilt += 0.75 * slip;
      out.yOffset += size * 0.22 * slip;
      out.jitter += Math.sin(elapsed * 26) * size * 0.06 * slip;
      break;
    }

    case POSE.ponder:
      // Olhando o nada: cabeça pendida, respiração muito lenta.
      out.tilt += 0.16 * ease;
      out.bob *= 0.15;
      out.squashY = 1 + Math.sin(elapsed * 1.1) * 0.03;
      break;

    case POSE.play:
      // Brinca com uma folha: pulinhos e giros de um lado para o outro.
      out.bob += Math.abs(Math.sin(elapsed * 7)) * size * 0.16 * ease;
      out.tilt += Math.sin(elapsed * 5) * 0.3 * ease;
      break;

    case POSE.perk:
      // Se anima do nada: um pulo seco e um esticão.
      out.bob += Math.sin(t * Math.PI) * size * 0.3;
      out.squashY *= 1 + Math.sin(t * Math.PI) * 0.12;
      break;

    case POSE.hurt: {
      // Encolhida: afunda, aperta o corpo e treme. O tremor é forte no começo
      // e vai cedendo, como dor que passa.
      const throb = 1 - t * 0.6;
      out.squashY *= 1 - 0.2 * ease;
      out.squashX *= 1 + 0.12 * ease;
      out.yOffset += size * 0.2 * ease;
      out.tilt += 0.2 * ease;
      out.jitter += Math.sin(elapsed * 26) * size * 0.07 * ease * throb;
      out.bob = 0;
      break;
    }

    case POSE.sigh:
      // Suspiro: enche e esvazia devagar, e afunda um pouco.
      out.squashY *= 1 + Math.sin(t * Math.PI) * 0.1;
      out.yOffset += size * 0.05 * Math.sin(t * Math.PI);
      out.bob *= 0.3;
      break;

    default:
      break;
  }
}

/**
 * Bit de "escondido" que a simulação empacota junto do frescor, no campo
 * `color` do buffer de itens. Cópia local: o renderer não importa @simulation.
 */
/**
 * Onde fica o PÉ de cada peça, em fração da altura da textura. É por este
 * ponto que ela é plantada na casa — errar aqui faz a árvore pairar.
 */
const FOOT_ANCHOR: Record<ScenerySpot['kind'], number> = {
  tree: 0.94,
  rock: 0.88,
  bush: 0.87,
  computer: 0.92,
};

/**
 * Onde fica o meio da tela do computador, contando do topo da textura, e a
 * largura útil dela. Ficam aqui porque são medidas do DESENHO da máquina — o
 * texto tem de cair dentro do vidro, não em cima da carcaça.
 */
const SCREEN_CENTER_Y = 32;
const SCREEN_WIDTH = 38;

/** Uma muda não é uma árvore em miniatura: começa baixinha e engrossa depois. */
const growthScale = (growth: number): number => 0.35 + growth * 0.65;

/** Cores do losango que mostra onde a peça arrastada vai pousar. */
const TILE_CURSOR_OK = 0xfff2a8;
const TILE_CURSOR_NO = 0xe06060;
/** Quanto a peça sobe do chão enquanto está na mão, em pixels de tela. */
const LIFT_HEIGHT = 26;
/** Erguida, ela passa na frente de tudo — está mais perto de quem olha. */
const LIFT_DEPTH_BONUS = 100000;

const HIDDEN_FLAG = 256;

/** Props altos dividem camada com as criaturas (grama alta, tronco, junco). */
const TALL_PROP_KINDS = new Set([0, 6, 9]);
const isTall = (kind: number): boolean => TALL_PROP_KINDS.has(kind);

/**
 * Um quadro de passo a cada tantos pixels andados. Sete dá uma passada por
 * meio segundo numa criatura de velocidade média — o bastante para ler como
 * caminhada, sem virar corridinha de desenho animado.
 */
const STEPS_PER_PIXEL = 1 / 7;
/** Divisor do tamanho que dá a escala do sprite de 16 pixels. */
const CREATURE_SCALE = 6.5;
/**
 * A que distância do centro do corpo fica a sola do pé, em fração do tamanho.
 * É o mesmo número que posiciona a sombra: os dois têm de bater, senão a
 * criatura descola do chão.
 */
const GROUND_CONTACT = 0.42;
/** O quanto das deformações do corpo sobra, agora que o desenho é à mão. */
const SQUASH_DAMPING = 0.34;
/** Num gesto deliberado, quase tudo: é o movimento que conta o gesto. */
const POSE_GIVE = 0.85;
const BLINK_DURATION = 0.11;
const DUST_INTERVAL = 0.22;

/**
 * Uma criatura na tela.
 *
 * Era corpo + rosto em duas camadas, porque a arte era gerada por código e
 * trocar de emoção não podia redesenhar o corpo. Com a folha desenhada à mão,
 * cada estado é UM quadro inteiro: um sprite só, e a troca é de textura.
 */
interface CreatureSlot {
  container: Container;
  sprite: Sprite;
  facing: number;
  seen: number;
  /** Relógio do ciclo de passos, avança com a distância percorrida. */
  step: number;
  /** Onde ela estava no quadro anterior, para medir o passo de verdade. */
  lastX: number;
  lastY: number;
  /** Defasagem própria do relógio de respiração e de gesto. */
  phase: number;
  blinkIn: number;
  blinking: number;
  yawnIn: number;
  yawning: number;
}

interface Dust {
  sprite: Sprite;
  life: number;
  vx: number;
  vy: number;
}

/** Sinal visual efêmero (coração, gota, estrela) subindo sobre uma criatura. */
interface Feedback {
  sprite: Sprite;
  life: number;
  maxLife: number;
}

interface Leaf {
  sprite: Sprite;
  x: number;
  y: number;
  vy: number;
  sway: number;
  phase: number;
  spin: number;
}

export function createRenderer(options: RendererOptions): Renderer {
  let app: Application | null = null;
  let worldLayer: Container | null = null;
  let sandLayer: Container | null = null;
  let waterLayer: Container | null = null;
  let decorationLayer: Container | null = null;
  let resourceLayer: Container | null = null;
  let itemLayer: Container | null = null;
  let hiddenItemLayer: Container | null = null;
  let reflectionLayer: Container | null = null;
  let shadowG: Graphics | null = null;
  let selectionG: Graphics | null = null;
  let marqueeG: Graphics | null = null;
  let creatureLayer: Container | null = null;
  let particleLayer: Container | null = null;
  let destroyed = false;

  // Texturas geradas no mount.
  /** Os vinte quadros do Tintim, recortados da folha desenhada à mão. */
  let tintimFrames: Texture[] = [];
  let resourceTextures: Texture[] = [];
  let waterFrames: Texture[] = [];
  let leafTextures: Texture[] = [];
  let scenery: SceneryTextures | null = null;

  /**
   * A câmera vive em coordenadas JÁ PROJETADAS. Guardá-la em cartesiano faria
   * o arrasto andar na diagonal errada: o jogador puxa para a direita e o mundo
   * desce.
   */
  const camera = {
    isoX: isoX(options.worldWidth / 2, options.worldHeight / 2),
    isoY: isoY(options.worldWidth / 2, options.worldHeight / 2),
    zoom: 1,
  };
  let fitZoom = 1;
  let cameraReady = false;

  const creatureSlots = new Map<number, CreatureSlot>();
  const resourceSprites: Sprite[] = [];
  const waterSprites: Array<{ sprite: Sprite; phase: number }> = [];
  const leaves: Leaf[] = [];
  const dust: Dust[] = [];
  const dustPool: Sprite[] = [];
  const itemSprites: Sprite[] = [];
  const feedback: Feedback[] = [];
  let propTextures: Texture[][] = [];
  const tallProps: Array<{ sprite: Sprite; view: PropView }> = [];
  const treeSprites: Array<{ sprite: Sprite; phase: number; shake: number }> = [];
  /** Um por peça de cenário, na MESMA ordem de `sceneryList`: é o que permite
   *  levantar do chão exatamente a árvore que o dedo pegou. */
  const sceneryEntries: Array<{
    sprite: Sprite;
    scale: number;
    growth: number;
    /** Retângulo que o sprite ocupa na tela, medido a partir do PÉ da peça. */
    halfWidth: number;
    up: number;
    down: number;
  }> = [];
  const reflections: Array<{ sprite: Sprite; phase: number; scale: number }> = [];
  /**
   * A tela do computador.
   *
   * A palavra é TEXTO de verdade, não pixel desenhado na textura: ela muda a
   * cada lição, e é a única coisa do jogo que o jogador lê literalmente. Sem
   * isso, a máquina seria uma caixa piscando e ensinar seria um número subindo
   * em silêncio — o jogador precisa VER a palavra que a criatura está olhando.
   */
  let screenLabel: { text: Text; piece: ScenerySpot; width: number; showing: number } | null = null;
  /** Palavras ditas em voz alta, subindo e sumindo. */
  const bubbles: Array<{ text: Text; life: number }> = [];
  const ripples: Array<{ x: number; y: number; life: number }> = [];
  let groundPropLayer: Container | null = null;
  let tileCursorG: Graphics | null = null;
  let rippleG: Graphics | null = null;
  let rainbowG: Graphics | null = null;
  let ambientTextures: Texture[][] = [];
  let rainTextures: Texture[] = [];
  const ambientSprites: Sprite[] = [];
  const rainDrops: Array<{ sprite: Sprite; x: number; y: number; speed: number }> = [];
  let ambientLayer: Container | null = null;
  /** O que emite luz própria fica ACIMA do escurecimento da noite. */
  let glowLayer: Container | null = null;
  let rainLayer: Container | null = null;
  let puddleG: Graphics | null = null;
  let weatherTint: Graphics | null = null;
  let selectedScreenCb: ((x: number, y: number, visible: boolean) => void) | null = null;
  let dustTexture: Texture | null = null;
  let feedbackTextures: Record<FeedbackKind, Texture> | null = null;
  let handTextures: Record<HandState, Texture> | null = null;
  let handSprite: Sprite | null = null;
  let dustTimer = 0;
  let frameId = 0;
  let lastTime = 0;
  let elapsed = 0;

  /** Pequena nuvem de poeira ao pisar. */
  function spawnDust(x: number, y: number, size: number): void {
    if (!particleLayer || !dustTexture || dust.length > 60) return;
    const sprite = dustPool.pop() ?? new Sprite(dustTexture);
    sprite.anchor.set(0.5);
    sprite.alpha = 0.5;
    sprite.scale.set(size / 22);
    sprite.position.set(isoX(x, y), isoY(x, y));
    particleLayer.addChild(sprite);
    dust.push({ sprite, life: 0.45, vx: (Math.random() - 0.5) * 6, vy: -4 - Math.random() * 4 });
  }

  let gestures: GestureRecognizer | null = null;
  let lastCreatures: CreatureRenderBuffer | null = null;
  let lastItems: RenderBuffer | null = null;
  let lastItemIds: Int32Array | null = null;
  let sceneryList: readonly ScenerySpot[] = [];
  /** Índice da peça de cenário que está na mão agora, ou null. */
  let draggedScenery: number | null = null;
  /**
   * Retângulo de seleção, em coordenadas JÁ PROJETADAS.
   *
   * Guardado assim de propósito: na tela o retângulo é alinhado aos eixos, mas
   * no mundo ele é um losango. Comparar em espaço projetado é o que faz a
   * varredura pegar exatamente quem o jogador enxergou dentro da caixa.
   */
  let marquee: { x1: number; y1: number; x2: number; y2: number } | null = null;
  /** Quem está selecionado agora, para o gesto saber se um toque é ordem. */
  const selectedNow = new Set<number>();
  /** A peça que estava tremendo, para poder devolvê-la ao lugar ao soltar. */
  let lastLoosening: number | null = null;
  let dragX = 0;
  let dragY = 0;
  let waterProbe: ((x: number, y: number) => boolean) | null = null;
  const handWorld = { x: 0, y: 0, inside: false };
  /**
   * A última entrada veio de um dedo. Dedo é mais grosso e menos preciso que
   * um cursor, então os alvos crescem — sem isso, pegar uma fruta no celular
   * vira sorte.
   */
  let touchMode = false;
  const pickSlack = (): number => (touchMode ? 1.7 : 1);

  /**
   * Tela → mundo, desfazendo a câmera E a projeção isométrica.
   *
   * Sem o segundo passo o clique cai num lugar e a criatura está em outro: a
   * mão do jogador deixaria de coincidir com o que ele enxerga, e todo o jogo
   * (que é só gesto) desmoronaria.
   */
  const screenToWorld = (sx: number, sy: number, sw: number, sh: number): { x: number; y: number } =>
    unIso((sx - sw / 2) / camera.zoom + camera.isoX, (sy - sh / 2) / camera.zoom + camera.isoY);

  /**
   * A criatura sob o ponto.
   *
   * Aqui estava o motivo de "o mouse não faz nada nelas". O alvo era um
   * círculo em volta do PONTO DO MUNDO da criatura — o centro do corpo, que
   * fica no chão. Só que o desenho sobe da tela a partir dali: clicar na
   * cabeça, que é a parte que o jogador enxerga e mira, caía a trinta pixels
   * de mundo do centro, fora de um alcance de vinte e dois. O clique só pegava
   * se acertasse exatamente os pés.
   *
   * Agora o alvo é o RETÂNGULO DO DESENHO, a mesma conta que já valia para as
   * árvores e os objetos: qualquer pixel da criatura que esteja na tela é
   * clicável, que é o que qualquer um espera.
   */
  function pickCreature(worldX: number, worldY: number): number | null {
    const buffer = lastCreatures;
    if (!buffer) return null;
    let best: number | null = null;
    let bestDepth = -Infinity;
    for (let i = 0; i < buffer.count; i++) {
      const x = buffer.x[i]!;
      const y = buffer.y[i]!;
      const size = buffer.size[i]!;
      const box = creatureBox(size);
      if (!insideSprite(worldX, worldY, x, y, box.halfWidth, box.up, box.down)) continue;
      // Duas coladas: ganha a da frente, que é a que está desenhada por cima.
      const depth = isoDepth(x, y);
      if (depth > bestDepth) {
        bestDepth = depth;
        best = buffer.id[i]!;
      }
    }
    return best;
  }

  /**
   * O dedo está EM CIMA do desenho?
   *
   * Esta é a conta que faltava, e é a razão de arrastar não funcionar direito.
   * O ponteiro devolve um ponto do CHÃO — a casa onde o dedo pousou. Mas uma
   * árvore não está deitada no chão: ela sobe pela tela. Encostar no meio da
   * copa devolve um ponto do mundo que fica lá atrás, uma casa e meia adiante,
   * e o teste "que peça está nesse ponto?" respondia *nenhuma*.
   *
   * Aqui o ponto do mundo é convertido de volta para o deslocamento em TELA
   * relativo ao pé da peça, e comparado com o retângulo que o sprite ocupa.
   * Isso é exatamente o que o jogador enxerga, e não depende do zoom: sprite e
   * mundo são ampliados pelo mesmo fator.
   */
  function insideSprite(
    worldX: number,
    worldY: number,
    footX: number,
    footY: number,
    halfWidth: number,
    up: number,
    down: number,
  ): boolean {
    const dx = worldX - footX;
    const dy = worldY - footY;
    const screenX = dx - dy;
    const screenY = (dx + dy) * ISO_SQUASH;
    const slack = pickSlack();
    return (
      Math.abs(screenX) <= halfWidth * slack &&
      screenY <= down * slack + 2 &&
      screenY >= -up * slack
    );
  }

  /**
   * O retângulo que a criatura ocupa na tela, medido a partir do seu ponto no
   * mundo. Uma conta só, usada pelo clique e por quem precisar mirar nela.
   */
  function creatureBox(size: number): { halfWidth: number; up: number; down: number } {
    const height = ART * (size / CREATURE_SCALE);
    const foot = size * GROUND_CONTACT * ISO_SQUASH;
    return {
      halfWidth: Math.max(height / 2.4, 9),
      up: Math.max(height - foot, 12),
      down: Math.max(foot, 4),
    };
  }

  function pickItem(worldX: number, worldY: number): number | null {
    const buffer = lastItems;
    const ids = lastItemIds;
    if (!buffer || !ids) return null;
    let best: number | null = null;
    let bestDepth = -Infinity;
    for (let i = 0; i < buffer.count; i++) {
      const x = buffer.x[i]!;
      const y = buffer.y[i]!;
      const half = Math.max(buffer.radius[i]! * 1.4, 8);
      if (!insideSprite(worldX, worldY, x, y, half, half * 1.8, half * 0.7)) continue;
      // Empate resolve pela frente: quem está mais perto de quem olha.
      const depth = isoDepth(x, y);
      if (depth > bestDepth) {
        bestDepth = depth;
        best = ids[i]!;
      }
    }
    return best;
  }

  /**
   * Árvore/pedra/arbusto sob o ponto.
   *
   * Duas tentativas. A primeira é o DESENHO: o tronco, a copa, a pedra inteira
   * — tudo que o jogador vê é alvo, porque é isso que ele acha que está
   * tocando. A segunda é a CASA, que pega o caso do dedo no chão em volta do
   * pé, onde não há pixel de sprite mas há a promessa da grade.
   */
  function pickScenery(worldX: number, worldY: number): { kind: string; index: number } | null {
    let best: { kind: string; index: number } | null = null;
    let bestDepth = -Infinity;
    for (let i = 0; i < sceneryList.length; i++) {
      const piece = sceneryList[i]!;
      const box = sceneryEntries[i];
      if (!box) continue;
      if (!insideSprite(worldX, worldY, piece.x, piece.y, box.halfWidth, box.up, box.down)) continue;
      // Várias copas se sobrepõem: ganha a que está desenhada por cima.
      const depth = isoDepth(piece.x, piece.y);
      if (depth > bestDepth) {
        bestDepth = depth;
        best = { kind: piece.kind, index: i };
      }
    }
    if (best) return best;

    const col = tileColOf(worldX);
    const row = tileRowOf(worldY);
    for (let i = 0; i < sceneryList.length; i++) {
      const piece = sceneryList[i]!;
      if (piece.col === col && piece.row === row) return { kind: piece.kind, index: i };
    }
    return null;
  }

  /**
   * Quem ficou dentro do retângulo.
   *
   * A comparação acontece em espaço PROJETADO: é lá que a caixa é um
   * retângulo. Em coordenadas de mundo ela seria um losango, e a varredura
   * pegaria criaturas que o jogador não viu dentro dela.
   */
  function creaturesInBox(x1: number, y1: number, x2: number, y2: number): number[] {
    const buffer = lastCreatures;
    if (!buffer) return [];
    const left = Math.min(isoX(x1, y1), isoX(x2, y2));
    const right = Math.max(isoX(x1, y1), isoX(x2, y2));
    const top = Math.min(isoY(x1, y1), isoY(x2, y2));
    const bottom = Math.max(isoY(x1, y1), isoY(x2, y2));
    const found: number[] = [];
    for (let i = 0; i < buffer.count; i++) {
      const px = isoX(buffer.x[i]!, buffer.y[i]!);
      const py = isoY(buffer.x[i]!, buffer.y[i]!);
      if (px >= left && px <= right && py >= top && py <= bottom) found.push(buffer.id[i]!);
    }
    return found;
  }

  /** A casa está livre para receber a peça que está sendo arrastada? */
  function tileAcceptsDrop(col: number, row: number, ignoreIndex: number): boolean {
    if (col < 0 || row < 0 || col >= tileCols(options.worldWidth)) return false;
    if (row >= tileRows(options.worldHeight)) return false;
    // Água na casa: o renderer sabe disso pelo mesmo mapa que desenha o lago.
    const probe = waterProbe;
    if (probe) {
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const x = col * TILE + ((sx + 0.5) / 3) * TILE;
          const y = row * TILE + ((sy + 0.5) / 3) * TILE;
          if (probe(x, y)) return false;
        }
      }
    }
    for (let i = 0; i < sceneryList.length; i++) {
      if (i === ignoreIndex) continue;
      if (sceneryList[i]!.col === col && sceneryList[i]!.row === row) return false;
    }
    return true;
  }

  /**
   * Entrada.
   *
   * A filosofia do jogo é "um dedo (ou o mouse) É a mão" — tudo o que ela toca
   * é o mundo, nunca um botão. Isso deixa a câmera sem gesto no celular, então
   * ela fica com o que sobra e não conflita: **dois dedos**. Pinçar dá zoom,
   * arrastar com dois move. No mouse continuam a roda e o botão do meio.
   */
  function attachInput(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = 'none';
    // A seta do sistema some: quem representa o jogador é a mão desenhada.
    canvas.style.cursor = 'none';

    // Câmera por mouse: botão do meio arrasta.
    let panning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panCamX = 0;
    let panCamY = 0;

    /** Dedos encostados agora, na ordem em que chegaram. */
    const touches = new Map<number, { x: number; y: number }>();
    /** Estado do gesto de dois dedos, entre um quadro e o seguinte. */
    let pinchDistance = 0;
    let pinchMidX = 0;
    let pinchMidY = 0;

    const localX = (event: PointerEvent): number =>
      event.clientX - canvas.getBoundingClientRect().left;
    const localY = (event: PointerEvent): number =>
      event.clientY - canvas.getBoundingClientRect().top;

    const toWorld = (event: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        ...screenToWorld(
          event.clientX - rect.left,
          event.clientY - rect.top,
          app?.screen.width ?? 0,
          app?.screen.height ?? 0,
        ),
      };
    };

    /** Zoom mantendo fixo o ponto do mundo sob (sx, sy) na tela. */
    const zoomAt = (sx: number, sy: number, factor: number): void => {
      if (!app) return;
      const anchorX = (sx - app.screen.width / 2) / camera.zoom + camera.isoX;
      const anchorY = (sy - app.screen.height / 2) / camera.zoom + camera.isoY;
      camera.zoom = clamp(camera.zoom * factor, fitZoom * 0.8, fitZoom * 10);
      camera.isoX = anchorX - (sx - app.screen.width / 2) / camera.zoom;
      camera.isoY = anchorY - (sy - app.screen.height / 2) / camera.zoom;
    };

    const startPinch = (): void => {
      const [a, b] = [...touches.values()];
      if (!a || !b) return;
      pinchDistance = Math.hypot(b.x - a.x, b.y - a.y);
      pinchMidX = (a.x + b.x) / 2;
      pinchMidY = (a.y + b.y) / 2;
    };

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    /** Capturar o ponteiro pode falhar (o dedo já saiu, o navegador recusou).
     *  Isso não pode derrubar o resto do gesto. */
    const capture = (id: number): void => {
      try {
        canvas.setPointerCapture(id);
      } catch {
        /* segue o jogo */
      }
    };
    const release = (id: number): void => {
      try {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      } catch {
        /* segue o jogo */
      }
    };

    canvas.addEventListener('pointerdown', (event) => {
      capture(event.pointerId);
      // Botão direito: ordem, como em qualquer jogo de estratégia.
      if (event.button === 2) {
        event.preventDefault();
        const { x, y } = toWorld(event);
        gestures?.secondaryDown(x, y);
        return;
      }
      if (event.button === 1) {
        event.preventDefault();
        panning = true;
        panStartX = event.clientX;
        panStartY = event.clientY;
        panCamX = camera.isoX;
        panCamY = camera.isoY;
        return;
      }

      touchMode = event.pointerType === 'touch';
      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, { x: localX(event), y: localY(event) });
        if (touches.size === 2) {
          // Chegou o segundo dedo: o que o primeiro tinha começado é cancelado.
          // Sem isto, pinçar para dar zoom acabaria arremessando uma fruta.
          gestures?.cancel();
          handWorld.inside = false;
          startPinch();
          return;
        }
        if (touches.size > 2) return;
      }

      const { x, y } = toWorld(event);
      handWorld.x = x;
      handWorld.y = y;
      handWorld.inside = true;
      gestures?.pointerDown(x, y, event.timeStamp, event.button);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (panning) {
        camera.isoX = panCamX - (event.clientX - panStartX) / camera.zoom;
        camera.isoY = panCamY - (event.clientY - panStartY) / camera.zoom;
        return;
      }

      if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
        touches.set(event.pointerId, { x: localX(event), y: localY(event) });
        if (touches.size >= 2) {
          const [a, b] = [...touches.values()];
          if (!a || !b) return;
          const distance = Math.hypot(b.x - a.x, b.y - a.y);
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;

          // Arrastar com dois dedos move a câmera...
          if (app) {
            camera.isoX -= (midX - pinchMidX) / camera.zoom;
            camera.isoY -= (midY - pinchMidY) / camera.zoom;
          }
          // ...e afastá-los ou juntá-los dá zoom, ancorado no meio deles.
          if (pinchDistance > 0 && distance > 0) zoomAt(midX, midY, distance / pinchDistance);

          pinchDistance = distance;
          pinchMidX = midX;
          pinchMidY = midY;
          return;
        }
      }

      const { x, y } = toWorld(event);
      handWorld.x = x;
      handWorld.y = y;
      handWorld.inside = true;
      gestures?.pointerMove(x, y, event.timeStamp);
    });

    const endPointer = (event: PointerEvent): void => {
      release(event.pointerId);
      if (event.button === 1 || panning) {
        panning = false;
        return;
      }

      if (event.pointerType === 'touch') {
        const wasPinching = touches.size >= 2;
        touches.delete(event.pointerId);
        if (wasPinching) {
          // Saindo da pinça: o dedo que ficou não vira um gesto pela metade.
          if (touches.size >= 2) startPinch();
          else pinchDistance = 0;
          handWorld.inside = false;
          return;
        }
        // No toque não existe "passar o mouse": a mão some quando o dedo sai.
        handWorld.inside = false;
      }

      const { x, y } = toWorld(event);
      gestures?.pointerUp(x, y, event.timeStamp, event.button);
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'touch') return; // já tratado no pointerup
      handWorld.inside = false;
      gestures?.pointerLeave();
    });

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.12 : 1 / 1.12);
      },
      { passive: false },
    );
  }

  return {
    async mount(container: HTMLElement): Promise<void> {
      const instance = new Application();
      await instance.init({
        resizeTo: container,
        background: BACKGROUND_COLOR,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });
      if (destroyed) {
        instance.destroy(true);
        return;
      }

      resourceTextures = makeResourceTextures();
      waterFrames = makeWaterTextures();
      leafTextures = makeLeafTextures();
      dustTexture = makeDustTexture();
      feedbackTextures = makeFeedbackTextures();
      handTextures = makeHandTextures();
      ambientTextures = makeAmbientTextures();
      propTextures = makePropTextures();
      rainTextures = makeRainTextures();
      scenery = makeSceneryTextures(createRng(7));
      tintimFrames = await loadTintimFrames();

      const root = new Container();
      root.sortableChildren = false;

      // O TABULEIRO.
      //
      // Um sprite quadrado por casa, desenhado no container do chão — que
      // carrega a matriz isométrica. Ou seja: aqui só existem quadrados, e é o
      // Pixi que os entrega em losango. As variantes são sorteadas com semente
      // fixa, então o mesmo mundo tem sempre o mesmo gramado.
      const tileTextures = makeTileTextures(TILE);
      const tiles = new Container();
      const tileRng = createRng(0x7a11e);
      const gridCols = tileCols(options.worldWidth);
      const gridRows = tileRows(options.worldHeight);
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const sprite = new Sprite(tileTextures[tileRng.int(tileTextures.length)]!);
          sprite.position.set(col * TILE, row * TILE);
          tiles.addChild(sprite);
        }
      }

      // Onde a peça arrastada vai pousar. Desenhado como quadrado, some como
      // losango aceso em volta da casa.
      const tileCursor = new Graphics();
      const sand = new Container();
      const water = new Container();
      const reflections = new Container();
      const hiddenItems = new Container();
      const resources = new Container();
      const groundProps = new Container();
      const ripplesG = new Graphics();
      const rainbow = new Graphics();
      const puddles = new Graphics();
      const itemsLayer = new Container();
      const ambient = new Container();
      const rain = new Container();
      const tint = new Graphics();
      const glow = new Container();
      const shadows = new Graphics();
      const selection = new Graphics();
      const marqueeRect = new Graphics();
      const creatures = new Container();
      creatures.sortableChildren = true;
      const particles = new Container();
      const hand = new Sprite(handTextures.open);
      hand.anchor.set(0.25, 0.15);
      // O CHÃO recebe a matriz isométrica: tudo que for desenhado aqui usa
      // coordenadas cartesianas e sai projetado em losango, de graça.
      const ground = new Container();
      ground.setFromMatrix(
        new Matrix(ISO_MATRIX.a, ISO_MATRIX.b, ISO_MATRIX.c, ISO_MATRIX.d, 0, 0),
      );
      ground.addChild(
        tiles,
        sand,
        water,
        reflections,
        ripplesG,
        puddles,
        tileCursor,
        shadows,
        selection,
      );

      // O QUE FICA EM PÉ não é inclinado — só a POSIÇÃO é projetada. Uma
      // criatura girada 45 graus não é isométrica, é uma criatura tombada.
      const upright = new Container();
      upright.sortableChildren = true;
      // Cenário e criaturas na MESMA camada ordenada. Em vista isométrica, uma
      // árvore que está atrás não pode ser desenhada por cima de quem está na
      // frente — e com camadas separadas isso era inevitável.
      upright.addChild(groundProps, hiddenItems, resources, creatures, itemsLayer, marqueeRect);

      root.addChild(ground, upright, ambient, particles, rain, tint, glow, rainbow, hand);
      instance.stage.addChild(root);

      // Partículas de folhas.
      const leafRng = createRng(42);
      for (let i = 0; i < LEAF_COUNT; i++) {
        const texture = leafTextures[leafRng.int(leafTextures.length)]!;
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.alpha = 0.85;
        const leaf: Leaf = {
          sprite,
          x: leafRng.range(0, options.worldWidth),
          y: leafRng.range(0, options.worldHeight),
          vy: leafRng.range(8, 22),
          sway: leafRng.range(6, 16),
          phase: leafRng.range(0, 6.28),
          spin: leafRng.range(-1, 1),
        };
        particles.addChild(sprite);
        leaves.push(leaf);
      }

      app = instance;
      handSprite = hand;
      itemLayer = itemsLayer;
      hiddenItemLayer = hiddenItems;
      reflectionLayer = reflections;
      ambientLayer = ambient;
      glowLayer = glow;
      groundPropLayer = groundProps;
      rippleG = ripplesG;
      rainbowG = rainbow;
      rainLayer = rain;
      puddleG = puddles;
      weatherTint = tint;
      worldLayer = root;
      tileCursorG = tileCursor;
      sandLayer = sand;
      waterLayer = water;
      // `decorations` deixou de ser camada própria: aponta para a ordenada.
      decorationLayer = creatures;
      resourceLayer = resources;
      shadowG = shadows;
      selectionG = selection;
      marqueeG = marqueeRect;
      creatureLayer = creatures;
      particleLayer = particles;

      container.appendChild(instance.canvas);
      attachInput(instance.canvas);
    },

    setTerrain(grid: TileGrid, waterValue: number, seed: number): void {
      if (!sandLayer || !waterLayer || !decorationLayer || !scenery) return;
      const { cols, rows, cellSize, cells } = grid;
      const isWater = (cx: number, cy: number): boolean =>
        cx >= 0 && cy >= 0 && cx < cols && cy < rows && cells[cy * cols + cx] === waterValue;

      waterProbe = (x, y) => {
        const cx = Math.floor(x / cellSize);
        const cy = Math.floor(y / cellSize);
        return isWater(cx, cy);
      };

      const sandTexture = makeSandTexture(seed);
      const waterScale = cellSize / 16;
      // A mancha de areia é maior que a célula de propósito: as vizinhas se
      // sobrepõem e o miolo da praia fica sólido, só a borda externa desbota.
      const sandScale = (cellSize / 20) * 2.2;
      const shoreRng = createRng(seed ^ 0x5ea);

      // Areia (margem): células perto de água. Água por cima.
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const water = isWater(cx, cy);
          const nearWater =
            water ||
            isWater(cx - 1, cy) ||
            isWater(cx + 1, cy) ||
            isWater(cx, cy - 1) ||
            isWater(cx, cy + 1) ||
            isWater(cx - 1, cy - 1) ||
            isWater(cx + 1, cy + 1) ||
            isWater(cx - 1, cy + 1) ||
            isWater(cx + 1, cy - 1);
          if (nearWater) {
            const s = new Sprite(sandTexture);
            s.anchor.set(0.5);
            // Espelhar e girar a areia quebra a escadinha: a margem deixa de
            // repetir o mesmo canto quadrado célula após célula.
            s.position.set(cx * cellSize + cellSize / 2, cy * cellSize + cellSize / 2);
            s.scale.set(
              shoreRng.chance(0.5) ? sandScale : -sandScale,
              shoreRng.chance(0.5) ? sandScale : -sandScale,
            );
            // Uma faixa de areia um pouco maior avança sobre a grama, para a
            // borda não terminar num degrau perfeito.
            s.scale.x *= 1 + shoreRng.range(0, 0.22);
            s.scale.y *= 1 + shoreRng.range(0, 0.22);
            sandLayer.addChild(s);
          }
          if (water) {
            const s = new Sprite(waterFrames[0]);
            s.anchor.set(0.5);
            s.position.set(cx * cellSize + cellSize / 2, cy * cellSize + cellSize / 2);
            s.scale.set(shoreRng.chance(0.5) ? waterScale : -waterScale, waterScale);
            // Raso na margem, fundo no meio: é o que dá volume ao lago.
            const shallow =
              !isWater(cx - 1, cy) ||
              !isWater(cx + 1, cy) ||
              !isWater(cx, cy - 1) ||
              !isWater(cx, cy + 1);
            if (shallow) s.tint = SHALLOW_TINT;
            waterSprites.push({ sprite: s, phase: shoreRng.int(8) });
            waterLayer.addChild(s);
          }
        }
      }
    },

    /** Desenha o cenário que o MUNDO possui (as árvores que dão frutas). */
    setScenery(pieces: readonly ScenerySpot[]): void {
      if (!decorationLayer || !scenery) return;

      // Tira da camada SÓ o que este método pôs ali.
      //
      // Aqui morava um bug feio: a chamada era `removeChildren()`, e desde que
      // a vista virou isométrica esta camada é a MESMA das criaturas — cenário
      // e bicho precisam se intercalar por profundidade, senão a árvore de trás
      // cobre quem está na frente. Limpar tudo arrancava as criaturas junto.
      // Enquanto o cenário só era desenhado uma vez, no início, ninguém via.
      // Quando as árvores e pedras passaram a ser arrastáveis, cada arrasto
      // fazia o rebanho inteiro sumir e deixar só as sombras no chão.
      for (const entry of sceneryEntries) {
        decorationLayer.removeChild(entry.sprite);
        entry.sprite.destroy();
      }
      if (screenLabel) {
        decorationLayer.removeChild(screenLabel.text);
        screenLabel.text.destroy();
        screenLabel = null;
      }
      reflectionLayer?.removeChildren();
      treeSprites.length = 0;
      reflections.length = 0;
      sceneryEntries.length = 0;
      sceneryList = pieces;
      for (const piece of pieces) {
        const variants = scenery[piece.kind];
        const texture = variants[piece.variant % variants.length]!;
        const sprite = new Sprite(texture);
        // Âncora no PÉ da peça, não no meio: é o pé que encosta na casa, e é
        // em torno dele que a árvore balança. Cada tipo tem o seu, porque a
        // sombra está desenhada em alturas diferentes nas texturas.
        sprite.anchor.set(0.5, FOOT_ANCHOR[piece.kind]);
        const scale = PIXEL_SCALE * growthScale(piece.growth);
        sprite.scale.set(scale);
        sprite.position.set(isoX(piece.x, piece.y), isoY(piece.x, piece.y));
        sprite.zIndex = isoDepth(piece.x, piece.y);
        decorationLayer.addChild(sprite);
        const anchorY = FOOT_ANCHOR[piece.kind];
        sceneryEntries.push({
          sprite,
          scale,
          growth: piece.growth,
          halfWidth: (texture.width * scale) / 2,
          up: texture.height * scale * anchorY,
          down: texture.height * scale * (1 - anchorY),
        });
        if (piece.kind === 'tree') {
          treeSprites.push({ sprite, phase: (piece.x + piece.y) * 0.05, shake: 0 });
        }

        if (piece.kind === 'computer') {
          const label = new Text({
            text: '',
            style: {
              fontFamily: 'monospace',
              fontSize: 22,
              fontWeight: 'bold',
              fill: 0x8ef0d4,
              align: 'center',
            },
          });
          label.anchor.set(0.5);
          // O meio da tela: medido a partir do PÉ da peça, como tudo aqui.
          const face = texture.height * anchorY - SCREEN_CENTER_Y;
          label.position.set(sprite.position.x, sprite.position.y - face * scale);
          label.zIndex = sprite.zIndex + 0.5;
          label.visible = false;
          decorationLayer.addChild(label);
          screenLabel = { text: label, piece, width: SCREEN_WIDTH * scale, showing: -1 };
        }

        // Quem está na beira aparece de cabeça para baixo na água. Só quem
        // está na beira: reflexo em cima da grama não seria reflexo nenhum.
        if (reflectionLayer && waterProbe?.(piece.x, piece.y + REFLECTION_PROBE)) {
          const mirror = new Sprite(texture);
          mirror.anchor.set(0.5, FOOT_ANCHOR[piece.kind]);
          mirror.scale.set(scale, -scale);
          mirror.position.set(piece.x, piece.y);
          mirror.tint = REFLECTION_TINT;
          mirror.alpha = 0.45;
          reflectionLayer.addChild(mirror);
          reflections.push({ sprite: mirror, phase: (piece.x - piece.y) * 0.04, scale });
        }
      }
    },

    setProps(props: readonly PropView[]): void {
      if (!groundPropLayer || !creatureLayer || propTextures.length === 0) return;
      groundPropLayer.removeChildren();
      tallProps.length = 0;

      for (const prop of props) {
        const variants = propTextures[prop.kind];
        if (!variants || variants.length === 0) continue;
        const sprite = new Sprite(variants[prop.variant % variants.length]!);
        sprite.anchor.set(0.5, 0.9);
        sprite.position.set(isoX(prop.x, prop.y), isoY(prop.x, prop.y));
        if (isTall(prop.kind)) {
          // Vegetação alta divide camada com as criaturas: quem está mais
          // abaixo na tela aparece na frente. É o que dá volume ao mundo.
          sprite.zIndex = isoDepth(prop.x, prop.y);
          creatureLayer.addChild(sprite);
          tallProps.push({ sprite, view: prop });
        } else {
          groundPropLayer.addChild(sprite);
        }
      }
    },

    creaturesInBox,

    shakeTreeAt(index: number): void {
      const spot = sceneryList[index];
      if (!spot) return;
      let treeIndex = 0;
      for (let i = 0; i < index; i++) if (sceneryList[i]!.kind === 'tree') treeIndex += 1;
      const tree = treeSprites[treeIndex];
      if (tree) tree.shake = 1;
    },

    ripple(x: number, y: number): void {
      if (ripples.length > 12) return;
      ripples.push({ x, y, life: 1 });
    },

    onSelectedScreen(callback: (x: number, y: number, visible: boolean) => void): void {
      selectedScreenCb = callback;
    },

    setHandlers(next: GestureHandlers): void {
      // O renderer se intromete no arrasto do cenário porque a peça na mão é
      // um assunto SÓ dele: a simulação não precisa saber que uma árvore está
      // no ar por dois segundos — precisa saber apenas onde ela pousou.
      const watched: GestureHandlers = {
        ...next,
        // O retângulo é assunto do desenho: a simulação só recebe quem ficou
        // dentro dele, no fim.
        onMarquee: (x1, y1, x2, y2) => {
          marquee = { x1: isoX(x1, y1), y1: isoY(x1, y1), x2: isoX(x2, y2), y2: isoY(x2, y2) };
          next.onMarquee(x1, y1, x2, y2);
        },
        onMarqueeEnd: (x1, y1, x2, y2) => {
          marquee = null;
          next.onMarqueeEnd(x1, y1, x2, y2);
        },
        onGrabScenery: (index) => {
          draggedScenery = index;
          // O alvo começa DEBAIXO DA MÃO. Sem esta linha, quem segura sem
          // arrastar levanta a árvore para a casa (0,0) — ela some do mapa até
          // o dedo se mexer, que foi exatamente o que aconteceu no teste.
          dragX = handWorld.x;
          dragY = handWorld.y;
          next.onGrabScenery(index);
        },
        onDragScenery: (index, x, y) => {
          dragX = x;
          dragY = y;
          next.onDragScenery(index, x, y);
        },
        onDropScenery: (index, x, y) => {
          draggedScenery = null;
          next.onDropScenery(index, x, y);
        },
      };
      gestures = new GestureRecognizer(watched, {
        creatureAt: pickCreature,
        hasSelection: () => selectedNow.size > 0,
        itemAt: pickItem,
        sceneryAt: pickScenery,
        isWater: (x, y) => waterProbe?.(x, y) ?? false,
      });
    },

    emit(kind: FeedbackKind, worldX: number, worldY: number): void {
      if (!particleLayer || !feedbackTextures || feedback.length > 40) return;
      const sprite = new Sprite(feedbackTextures[kind]);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(isoX(worldX, worldY), isoY(worldX, worldY));
      particleLayer.addChild(sprite);
      feedback.push({ sprite, life: 1.4, maxLife: 1.4 });
    },

    say(word: number, worldX: number, worldY: number): void {
      if (!particleLayer || bubbles.length > 16) return;
      const text = WORD_TEXT[word];
      if (!text) return;
      const bubble = new Text({
        text,
        style: {
          fontFamily: 'monospace',
          fontSize: 20,
          fontWeight: 'bold',
          fill: 0xfdfbf0,
          stroke: { color: 0x2a2f26, width: 5, join: 'round' },
        },
      });
      bubble.anchor.set(0.5, 1);
      // Metade do tamanho: o texto é desenhado grande e reduzido, senão fica
      // serrilhado quando a câmera se aproxima.
      bubble.scale.set(0.5);
      bubble.position.set(isoX(worldX, worldY), isoY(worldX, worldY) - 16);
      particleLayer.addChild(bubble);
      bubbles.push({ text: bubble, life: 2.2 });
    },

    frame(input: FrameInput): void {
      if (
        !app ||
        !worldLayer ||
        !resourceLayer ||
        !shadowG ||
        !selectionG ||
        !creatureLayer ||
        !particleLayer
      ) {
        return;
      }
      lastCreatures = input.creatures;
      lastItems = input.items;
      lastItemIds = input.itemIds;

      const now = performance.now();
      const dt = lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      elapsed += dt;
      gestures?.tick(dt);

      const screenWidth = app.screen.width;
      const screenHeight = app.screen.height;

      if (!cameraReady) {
        // Projetado, o mundo mede 2×largura por (largura+altura)/2 — não cabe
        // pela mesma conta de antes.
        const spanX = (options.worldWidth + options.worldHeight) * 1;
        const spanY = (options.worldWidth + options.worldHeight) * ISO_SQUASH;
        fitZoom = Math.min(screenWidth / spanX, screenHeight / spanY);
        camera.zoom = fitZoom * 2.4;
        cameraReady = true;
      }

      if (input.followId !== null) {
        const buffer = input.creatures;
        for (let i = 0; i < buffer.count; i++) {
          if (buffer.id[i] === input.followId) {
            const followX = lerp(buffer.prevX[i]!, buffer.x[i]!, input.alpha);
            const followY = lerp(buffer.prevY[i]!, buffer.y[i]!, input.alpha);
            camera.isoX = isoX(followX, followY);
            camera.isoY = isoY(followX, followY);
            break;
          }
        }
      }

      worldLayer.scale.set(camera.zoom);
      worldLayer.position.set(
        screenWidth / 2 - camera.isoX * camera.zoom,
        screenHeight / 2 - camera.isoY * camera.zoom,
      );

      // Água animada. Cada célula anda no seu próprio compasso: sem isso o
      // lago inteiro pisca junto e vira uma bandeira listrada.
      if (waterFrames.length > 0 && waterSprites.length > 0) {
        const frame = Math.floor((elapsed * 1000) / WATER_FRAME_MS);
        for (let i = 0; i < waterSprites.length; i++) {
          const cell = waterSprites[i]!;
          cell.sprite.texture = waterFrames[(frame + cell.phase) % waterFrames.length]!;
        }
      }

      // Recursos (plantas).
      const plants = input.plants;
      for (let i = 0; i < plants.count; i++) {
        let sprite = resourceSprites[i];
        if (!sprite) {
          sprite = new Sprite(resourceTextures[0]);
          sprite.anchor.set(0.5, 0.78);
          resourceLayer.addChild(sprite);
          resourceSprites[i] = sprite;
        }
        const variant = plants.variant[i]! % resourceTextures.length;
        sprite.texture = resourceTextures[variant]!;
        const px = plants.prevX[i]!;
        const py = plants.prevY[i]!;
        const plantX = px + (plants.x[i]! - px) * input.alpha;
        const plantY = py + (plants.y[i]! - py) * input.alpha;
        sprite.position.set(isoX(plantX, plantY), isoY(plantX, plantY));
        sprite.zIndex = isoDepth(plantX, plantY);
        sprite.scale.set(clamp(plants.radius[i]! * 0.16, 0.35, 1.15));
        sprite.visible = true;
      }
      for (let i = plants.count; i < resourceSprites.length; i++)
        resourceSprites[i]!.visible = false;

      // Criaturas + sombras.
      frameId += 1;
      const creatures = input.creatures;
      shadowG.clear();
      let selX = 0;
      let selY = 0;
      let selSize = 0;
      let selFound = false;

      for (let i = 0; i < creatures.count; i++) {
        const id = creatures.id[i]!;
        const px = creatures.prevX[i]!;
        const py = creatures.prevY[i]!;
        const cx = px + (creatures.x[i]! - px) * input.alpha;
        const cy = py + (creatures.y[i]! - py) * input.alpha;
        const size = creatures.size[i]!;
        // Só o eixo x interessa agora, e só para saber para que lado ela olha.
        const dx = creatures.x[i]! - px;
        const moving = creatures.moving[i] === 1;
        const mood = creatures.mood[i]!;
        const stage = creatures.stage[i]!;

        let slot = creatureSlots.get(id);
        if (!slot) {
          const container = new Container();
          const sprite = new Sprite();
          // Âncora no pé do desenho — e num valor REDONDO. Com 0,97 a âncora
          // caía em 15,52 de 16 pixels, e meio pixel de deslocamento borra
          // pixel art ampliada.
          sprite.anchor.set(0.5, 1);
          container.addChild(sprite);
          creatureLayer.addChild(container);
          slot = {
            container,
            sprite,
            facing: 1,
            seen: frameId,
            step: (id % 4) * 0.7,
            phase: (id % 17) * 0.41,
            lastX: cx,
            lastY: cy,
            blinkIn: 1 + (id % 7) * 0.5,
            blinking: 0,
            yawnIn: 6 + (id % 5) * 3,
            yawning: 0,
          };
          creatureSlots.set(id, slot);
        }

        // Passo: o ciclo avança com a DISTÂNCIA percorrida, não com o relógio.
        // É o que faz o bicho lento arrastar os pés e o apressado trotar, sem
        // nenhuma variável de velocidade na animação.
        //
        // A distância é medida entre o QUADRO ANTERIOR e este, na posição já
        // interpolada. A primeira versão usava `x - prevX`, que é o passo de um
        // TICK da simulação (20 por segundo) enquanto o desenho roda a 60: a
        // conta saía três vezes maior, toda criatura parecia estar correndo, e
        // o ciclo trocava de quadro a cada quadro — de longe, isso não lê como
        // andar, lê como tremer parado. Era o que estava acontecendo.
        const movedNow = Math.hypot(cx - slot.lastX, cy - slot.lastY);
        slot.lastX = cx;
        slot.lastY = cy;
        const speed = movedNow / Math.max(dt, 1 / 240);
        if (moving) slot.step += movedNow * STEPS_PER_PIXEL;

        // Piscar e bocejar continuam existindo como RITMO, mesmo sem quadro
        // próprio na folha: o piscar vira um instante de olhos fechados
        // (o quadro de dormir) e o bocejo, a boca aberta do espanto. São dois
        // sinais de vida que custam um quadro e mudam a leitura da criatura.
        const eyesOpen = mood !== MOOD.sleepy && mood !== MOOD.loved;
        slot.blinkIn -= dt;
        if (slot.blinking > 0) slot.blinking -= dt;
        else if (slot.blinkIn <= 0 && eyesOpen) {
          slot.blinking = BLINK_DURATION;
          slot.blinkIn = (mood === MOOD.sleepy ? 1.2 : 2.5) + Math.random() * 4;
        }
        const canYawn = mood === MOOD.sleepy || stage === 2;
        slot.yawnIn -= dt;
        if (slot.yawning > 0) slot.yawning -= dt;
        else if (slot.yawnIn <= 0 && canYawn) {
          slot.yawning = 0.9;
          slot.yawnIn = (stage === 2 ? 8 : 14) + Math.random() * 10;
        }

        const pose = creatures.pose[i]!;
        let frame = frameFor({
          mood,
          pose,
          moving,
          speed,
          carrying: creatures.carrying[i] === 1,
          step: slot.step,
          // Cada criatura respira no SEU tempo: sem a defasagem, o jardim
          // inteiro inflaria e desinflaria em uníssono, que é pior do que não
          // respirar.
          breath: elapsed + slot.phase,
        });
        if (!moving) {
          if (slot.yawning > 0) frame = FRAME.surprised;
          else if (slot.blinking > 0 && eyesOpen) frame = FRAME.blink;
        }
        const texture = tintimFrames[frame];
        if (texture && slot.sprite.texture !== texture) slot.sprite.texture = texture;

        // O olhar acompanha o movimento; se parada e curiosa, olha para a mão.
        if (dx > 0.05) slot.facing = 1;
        else if (dx < -0.05) slot.facing = -1;
        else if (mood === MOOD.curious && handWorld.inside) {
          slot.facing = handWorld.x >= cx ? 1 : -1;
        }

        // O desenho tem 16 pixels de altura onde o antigo tinha 32: a escala
        // dobra para a criatura ocupar o mesmo espaço no jardim.
        const scale = size / CREATURE_SCALE;
        const anim = animateBody(mood, elapsed, id, size, moving, stage);
        // A pose entra por cima do humor: o rosto segue contando a emoção,
        // o corpo passa a contar a ocupação.
        if (pose !== POSE.none) {
          animatePose(pose, creatures.poseTime[i]!, elapsed, size, anim);
        }
        // Bocejo empurra o corpo um pouco para trás, como um espreguiçar.
        const yawnTilt = slot.yawning > 0 ? -0.12 : 0;

        // Deformação contida.
        //
        // Quando a criatura era desenhada por código, esticar e girar o corpo
        // era barato e ficava bem. Agora o desenho é pixel art feita à mão, e
        // achatar ou inclinar demais desmancha a grade de pixels que dá a ela
        // a cara que tem. O movimento continua — só que quase todo por
        // POSIÇÃO (o pulinho, o tremor), que não distorce nada, e o resto
        // entra por um terço.
        // O gesto pode se mexer mais que a respiração.
        //
        // Com vinte quadros para dezenove gestos, é o MOVIMENTO que separa
        // "se coçar" de "cheirar uma flor". Conter tudo no mesmo terço deixou
        // os dois iguais — e foi o que tirou a vida das criaturas paradas. A
        // respiração de fundo continua discreta; o gesto deliberado recupera
        // quase toda a amplitude.
        const give = pose !== POSE.none ? POSE_GIVE : SQUASH_DAMPING;
        slot.container.scale.set(
          slot.facing * scale * (1 + (anim.squashX - 1) * give),
          scale * (1 + (anim.squashY - 1) * give),
        );
        slot.container.rotation = (anim.tilt + yawnTilt) * give * slot.facing;
        // O PÉ NO CHÃO.
        //
        // A posição da criatura no mundo é o centro do corpo, não a sola do
        // pé — é com o centro que a simulação faz colisão. A sombra sempre foi
        // desenhada embaixo desse centro, à distância do raio do corpo. Faltava
        // baixar o desenho a mesma distância: sem isso a criatura ficava com os
        // pés acima da própria sombra, e era exatamente isso que dava a
        // impressão de que ela flutuava.
        const bodyX = cx + anim.jitter;
        const bodyY = cy;
        slot.container.position.set(
          isoX(bodyX, bodyY),
          isoY(bodyX, bodyY) + size * GROUND_CONTACT * ISO_SQUASH - anim.bob + anim.yOffset,
        );
        slot.container.zIndex = isoDepth(cx, cy);

        slot.seen = frameId;

        // Poeirinha dos passos.
        if (moving && dustTimer <= 0) {
          spawnDust(cx, cy + size * GROUND_CONTACT, size);
        }

        // Sombra suave.
        shadowG.ellipse(cx, cy + size * GROUND_CONTACT, size * 0.62, size * 0.26).fill({
          color: SHADOW_COLOR,
          alpha: 0.24,
        });

        if (id === input.selectedId) {
          selX = cx;
          selY = cy + size * 0.35;
          selSize = size;
          selFound = true;
        }
      }

      // Recicla criaturas que sumiram.
      for (const [id, slot] of creatureSlots) {
        if (slot.seen !== frameId) {
          creatureLayer.removeChild(slot.container);
          slot.container.destroy({ children: true });
          creatureSlots.delete(id);
        }
      }

      // Posição do selecionado NA TELA, para o cartão flutuante seguir.
      if (selectedScreenCb) {
        if (selFound) {
          selectedScreenCb(
            isoX(selX, selY) * camera.zoom + screenWidth / 2 - camera.isoX * camera.zoom,
            (isoY(selX, selY) - selSize * 2.4) * camera.zoom +
              screenHeight / 2 -
              camera.isoY * camera.zoom,
            true,
          );
        } else {
          selectedScreenCb(0, 0, false);
        }
      }

      // Anel de seleção animado.
      // Anéis de seleção: um para cada criatura do grupo. Ficam no container do
      // chão, então saem elípticos na medida da perspectiva sem nenhuma conta
      // extra — é o mesmo losango das casas, só que redondo.
      selectionG.clear();
      const pulse = 1 + Math.sin(elapsed * 4) * 0.12;
      selectedNow.clear();
      for (const id of input.selectedIds) selectedNow.add(id);
      if (input.selectedIds.length > 0) {
        for (let i = 0; i < creatures.count; i++) {
          if (!selectedNow.has(creatures.id[i]!)) continue;
          const rx = creatures.x[i]!;
          const ry = creatures.y[i]! + creatures.size[i]! * GROUND_CONTACT;
          selectionG
            .ellipse(rx, ry, creatures.size[i]! * 1.5 * pulse, creatures.size[i]! * 0.7 * pulse)
            .stroke({ width: 1.5, color: SELECTION_COLOR, alpha: 0.9 });
        }
      } else if (selFound) {
        selectionG
          .ellipse(selX, selY, selSize * 1.5 * pulse, selSize * 0.7 * pulse)
          .stroke({ width: 1.5, color: SELECTION_COLOR, alpha: 0.9 });
      }

      // O retângulo da varredura. Vai no container SEM a matriz do chão: na
      // tela ele é alinhado aos eixos, como em qualquer jogo de estratégia —
      // inclinar junto com o terreno faria a caixa não bater com o gesto.
      if (marqueeG) {
        marqueeG.clear();
        if (marquee) {
          const x = Math.min(marquee.x1, marquee.x2);
          const y = Math.min(marquee.y1, marquee.y2);
          const w = Math.abs(marquee.x2 - marquee.x1);
          const h = Math.abs(marquee.y2 - marquee.y1);
          marqueeG
            .rect(x, y, w, h)
            .fill({ color: SELECTION_COLOR, alpha: 0.12 })
            .stroke({ width: 1.5 / camera.zoom, color: SELECTION_COLOR, alpha: 0.9 });
        }
      }

      // Objetos físicos (frutas, brinquedos).
      const items = input.items;
      if (itemLayer) {
        for (let i = 0; i < items.count; i++) {
          let sprite = itemSprites[i];
          if (!sprite) {
            sprite = new Sprite(resourceTextures[0]);
            sprite.anchor.set(0.5, 0.78);
            itemLayer.addChild(sprite);
            itemSprites[i] = sprite;
          }
          sprite.texture = resourceTextures[items.variant[i]! % resourceTextures.length]!;
          const px = items.prevX[i]!;
          const py = items.prevY[i]!;
          const itemX = px + (items.x[i]! - px) * input.alpha;
          const itemY = py + (items.y[i]! - py) * input.alpha;
          sprite.position.set(isoX(itemX, itemY), isoY(itemX, itemY));
          sprite.scale.set(clamp(items.radius[i]! * 0.14, 0.4, 1.2));
          // Frutas passadas escurecem: dá para ver que estão apodrecendo.
          const packed = items.color[i]!;
          const freshness = (packed & 0xff) / 255;
          const hidden = (packed & HIDDEN_FLAG) !== 0;
          sprite.tint = freshness > 0.5 ? 0xffffff : 0xa89070;
          // Escondido atrás da pedra: mal se vê a pontinha. Quem olhar com
          // atenção percebe; as criaturas precisam ir até lá.
          sprite.alpha = hidden ? 0.55 : 0.5 + freshness * 0.5;
          // O que está escondido desce para debaixo do cenário: a pedra passa
          // a cobri-lo de verdade, em vez de ficar transparente por cima dela.
          // O cogumelo luminoso acende quando escurece: sobe para a camada de
          // luz e atravessa a noite em vez de sumir nela.
          const glowing =
            items.variant[i] === GLOW_MUSHROOM_VARIANT && input.darkness > 0.3 && !hidden;
          if (glowing) sprite.alpha = 0.6 + input.darkness * 0.4;
          const wanted = hidden ? hiddenItemLayer : glowing ? glowLayer : itemLayer;
          if (wanted && sprite.parent !== wanted) wanted.addChild(sprite);
          sprite.visible = true;
        }
        for (let i = items.count; i < itemSprites.length; i++) itemSprites[i]!.visible = false;
      }

      // A mão do jogador dentro do mundo.
      if (handSprite && handTextures) {
        handSprite.visible = handWorld.inside;
        if (handWorld.inside) {
          const state = gestures?.handState ?? 'open';
          handSprite.texture = handTextures[state];
          // Tamanho constante na tela, independente do zoom.
          handSprite.scale.set(1 / camera.zoom);
          const wobble = state === 'petting' ? Math.sin(elapsed * 9) * 1.5 : 0;
          handSprite.position.set(
            isoX(handWorld.x, handWorld.y),
            isoY(handWorld.x, handWorld.y) + wobble / camera.zoom,
          );
        }
      }

      // Sinais visuais (corações, gotas, estrelas) subindo e desaparecendo.
      for (let i = feedback.length - 1; i >= 0; i--) {
        const signal = feedback[i]!;
        signal.life -= dt;
        if (signal.life <= 0) {
          particleLayer.removeChild(signal.sprite);
          signal.sprite.destroy();
          feedback.splice(i, 1);
          continue;
        }
        const t = 1 - signal.life / signal.maxLife;
        signal.sprite.position.y -= 14 * dt;
        signal.sprite.alpha = 1 - t * t;
        signal.sprite.scale.set(0.8 + t * 0.4);
      }

      // Palavras ditas: sobem devagar e somem. Sobem devagar de propósito —
      // uma palavra precisa ficar tempo suficiente para ser LIDA.
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const bubble = bubbles[i]!;
        bubble.life -= dt;
        if (bubble.life <= 0) {
          particleLayer.removeChild(bubble.text);
          bubble.text.destroy();
          bubbles.splice(i, 1);
          continue;
        }
        bubble.text.position.y -= 9 * dt;
        bubble.text.alpha = Math.min(1, bubble.life * 1.6);
      }

      // A tela do computador. Ela só acende quando alguém está aprendendo:
      // uma máquina que fica piscando sozinha no meio do mato é enfeite; uma
      // que acende quando a criatura chega é uma coisa acontecendo.
      if (screenLabel) {
        const { piece } = screenLabel;
        const on = piece.wordTimer > 0;
        screenLabel.text.visible = on;
        if (on) {
          if (screenLabel.showing !== piece.word) {
            screenLabel.showing = piece.word;
            screenLabel.text.text = WORD_TEXT[piece.word] ?? '';
            // Encolhe o que não couber no vidro: "filhote" é bem mais larga
            // que "casa", e uma palavra vazando pela carcaça estragaria a
            // ilusão de que aquilo é uma tela.
            screenLabel.text.scale.set(1);
            const natural = screenLabel.text.width;
            const fit = natural > 0 ? Math.min(0.6, screenLabel.width / natural) : 0.6;
            screenLabel.text.scale.set(fit);
          }
          // Pulsa de leve, como monitor velho.
          screenLabel.text.alpha = 0.82 + Math.sin(elapsed * 6) * 0.14;
        }
      }

      // Mudas crescendo.
      //
      // `sceneryList` é a MESMA lista que o mundo edita, então a muda plantada
      // engorda aqui sozinha, um pouquinho por quadro. Reconstruir o cenário
      // inteiro a cada quadro só para ver uma árvore crescer seria caro e sem
      // motivo — o que muda é uma escala.
      for (let i = 0; i < sceneryEntries.length; i++) {
        const entry = sceneryEntries[i]!;
        const piece = sceneryList[i];
        if (!piece || piece.growth === entry.growth) continue;
        entry.growth = piece.growth;
        const grown = PIXEL_SCALE * growthScale(piece.growth);
        // A muda cresce e o ALVO cresce junto: se a caixa ficasse com o
        // tamanho de quando ela nasceu, a árvore adulta seria clicável só no
        // pedacinho onde a muda estava.
        const ratio = grown / entry.scale;
        entry.scale = grown;
        entry.halfWidth *= ratio;
        entry.up *= ratio;
        entry.down *= ratio;
        if (i !== draggedScenery) entry.sprite.scale.set(entry.scale);
      }

      // Aviso de que a peça está cedendo: ela treme, cada vez mais forte, até
      // sair do chão. Sem isto, segurar uma árvore é meio segundo de nada
      // acontecendo — e ninguém segura até o fim uma coisa que não responde.
      const loosening = gestures?.liftIndex ?? null;
      if (loosening !== null && loosening !== lastLoosening) lastLoosening = loosening;
      if (lastLoosening !== null) {
        const entry = sceneryEntries[lastLoosening];
        const piece = sceneryList[lastLoosening];
        if (entry && piece) {
          const grip = loosening === null ? 0 : (gestures?.liftProgress ?? 0);
          const shiver = grip * grip * 2.2 * Math.sin(elapsed * 42);
          entry.sprite.position.set(
            isoX(piece.x, piece.y) + shiver,
            isoY(piece.x, piece.y) - grip * 2,
          );
          if (grip === 0) lastLoosening = null;
        } else {
          lastLoosening = null;
        }
      }

      // A peça que está na mão: sobe do chão, cresce um pouco e balança —
      // e o losango da casa embaixo diz, antes de largar, se ali dá.
      if (tileCursorG) {
        tileCursorG.clear();
        const entry = draggedScenery === null ? null : sceneryEntries[draggedScenery];
        if (draggedScenery !== null && entry) {
          const col = tileColOf(dragX);
          const row = tileRowOf(dragY);
          const fits = tileAcceptsDrop(col, row, draggedScenery);
          const anchorX = tileCenterX(col);
          const anchorY = tileCenterY(row);

          // No ar, pousada sobre a casa apontada. O balanço é o peso dela.
          const swing = Math.sin(elapsed * 5) * 2.5;
          entry.sprite.position.set(
            isoX(anchorX, anchorY) + swing,
            isoY(anchorX, anchorY) - LIFT_HEIGHT,
          );
          entry.sprite.zIndex = isoDepth(anchorX, anchorY) + LIFT_DEPTH_BONUS;
          entry.sprite.scale.set(entry.scale * 1.08);
          entry.sprite.alpha = fits ? 1 : 0.65;

          // O losango: um quadrado no container do chão já sai assim.
          tileCursorG
            .rect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2)
            .fill({ color: fits ? TILE_CURSOR_OK : TILE_CURSOR_NO, alpha: 0.22 })
            .stroke({ width: 2, color: fits ? TILE_CURSOR_OK : TILE_CURSOR_NO, alpha: 0.9 });
        }
      }

      // Vento na copa das árvores; sacudir soma um tranco por cima.
      for (const tree of treeSprites) {
        if (tree.shake > 0) tree.shake = Math.max(0, tree.shake - dt * 2.2);
        const wind = Math.sin(elapsed * 0.9 + tree.phase) * 0.022;
        tree.sprite.rotation = wind + tree.shake * Math.sin(elapsed * 26) * 0.09;
      }

      // O reflexo na água nunca fica parado: ondula e respira com a superfície.
      for (const mirror of reflections) {
        const wobble = Math.sin(elapsed * 1.7 + mirror.phase);
        mirror.sprite.skew.x = wobble * 0.09;
        mirror.sprite.scale.y =
          -mirror.scale * (0.86 + Math.sin(elapsed * 1.1 + mirror.phase) * 0.06);
        mirror.sprite.alpha = 0.42 + wobble * 0.06;
      }

      // Vento e toque: a vegetação alta balança.
      for (const entry of tallProps) {
        const wind = Math.sin(elapsed * 1.6 + entry.view.phase) * 0.05;
        entry.sprite.rotation = wind + entry.view.sway * Math.sin(elapsed * 22) * 0.3;
      }

      // Ondas onde o jogador tocou a água.
      if (rippleG) {
        rippleG.clear();
        for (let i = ripples.length - 1; i >= 0; i--) {
          const wave = ripples[i]!;
          wave.life -= dt * 0.9;
          if (wave.life <= 0) {
            ripples.splice(i, 1);
            continue;
          }
          const radius = (1 - wave.life) * 34;
          rippleG
            .ellipse(wave.x, wave.y, radius, radius * 0.55)
            .stroke({ width: 1.4, color: 0xcfe8f7, alpha: wave.life * 0.7 });
        }
      }

      // Arco-íris depois da chuva. É um ARCO — meia volta, com os pés no chão —
      // e só existe de dia: à noite não há sol para atravessar a água no ar.
      if (rainbowG) {
        rainbowG.clear();
        const daylight = 1 - input.darkness;
        if (input.rainbow > 0.01 && daylight > 0.25) {
          const colors = [0xef6b6b, 0xf0a94a, 0xf2e05a, 0x6fc46a, 0x5aa8e0, 0x9a7ad6];
          const cx = options.worldWidth * 0.5;
          const cy = options.worldHeight * 0.78;
          // Círculo achatado: desenhamos meia circunferência e esprememos o Y.
          rainbowG.scale.set(1, RAINBOW_SQUASH);
          rainbowG.position.set(0, cy * (1 - RAINBOW_SQUASH));
          for (let i = 0; i < colors.length; i++) {
            rainbowG
              .arc(cx, cy, 380 - i * 13, Math.PI, Math.PI * 2)
              .stroke({ width: 13, color: colors[i]!, alpha: input.rainbow * daylight * 0.32 });
          }
        }
      }

      // Bichinhos de ambiente: borboletas, abelhas, pássaros, bichinhos.
      if (ambientLayer && ambientTextures.length > 0) {
        for (let i = 0; i < input.ambient.length; i++) {
          const being = input.ambient[i]!;
          let sprite = ambientSprites[i];
          if (!sprite) {
            sprite = new Sprite();
            sprite.anchor.set(0.5);
            // O vaga-lume é a própria luz: fica por cima da escuridão.
            (being.kind === FIREFLY_KIND ? (glowLayer ?? ambientLayer) : ambientLayer).addChild(
              sprite,
            );
            ambientSprites[i] = sprite;
          }
          const frames = ambientTextures[being.kind] ?? ambientTextures[0]!;
          // Pousado = asas fechadas; voando = bate asas.
          const frame = being.resting > 0 ? 1 : Math.sin(being.phase) > 0 ? 0 : 1;
          sprite.texture = frames[frame]!;
          sprite.position.set(
            isoX(being.x, being.y),
            isoY(being.x, being.y) - (being.resting > 0 ? 0 : 3),
          );
          sprite.visible = true;
          // Na chuva os insetos se recolhem; vaga-lumes só aparecem à noite,
          // pulsando devagar.
          if (being.kind === FIREFLY_KIND) {
            // Pisca devagar, cada um no seu ritmo, e só existe quando escurece.
            const pulse = 0.68 + Math.sin(being.phase * 0.7) * 0.32;
            sprite.alpha = Math.max(0, (input.darkness - 0.25) / 0.75) * pulse;
            sprite.scale.set(1 + pulse * 0.5);
          } else {
            sprite.alpha = being.kind <= 1 ? 1 - input.rain : 1;
          }
        }
        for (let i = input.ambient.length; i < ambientSprites.length; i++) {
          ambientSprites[i]!.visible = false;
        }
      }

      // Poças no chão depois da chuva.
      if (puddleG) {
        puddleG.clear();
        for (const puddle of input.puddles) {
          puddleG
            .ellipse(puddle.x, puddle.y, 11 * puddle.life, 6 * puddle.life)
            .fill({ color: 0x5b90bd, alpha: 0.4 * puddle.life });
        }
      }

      // Chuva: gotas caindo + escurecimento do mundo.
      if (rainLayer && weatherTint && rainTextures.length > 0) {
        const wanted = Math.round(input.rain * 170);
        while (rainDrops.length < wanted) {
          const sprite = new Sprite(rainTextures[rainDrops.length % rainTextures.length]!);
          sprite.alpha = 0.65;
          rainLayer.addChild(sprite);
          rainDrops.push({
            sprite,
            x: Math.random() * options.worldWidth,
            y: Math.random() * options.worldHeight,
            speed: 420 + Math.random() * 260,
          });
        }
        while (rainDrops.length > wanted) {
          const drop = rainDrops.pop()!;
          rainLayer.removeChild(drop.sprite);
          drop.sprite.destroy();
        }
        for (const drop of rainDrops) {
          drop.y += drop.speed * dt;
          drop.x += 40 * dt;
          if (drop.y > options.worldHeight) {
            drop.y = -10;
            drop.x = Math.random() * options.worldWidth;
          }
          drop.sprite.position.set(drop.x, drop.y);
        }

        // A noite e a chuva escurecem o mundo pela mesma camada. A noite tem de
        // ser noite de verdade: sem isso os vaga-lumes não aparecem.
        weatherTint.clear();
        const nightAlpha = input.darkness * 0.78;
        const rainAlpha = input.rain * 0.4;
        if (nightAlpha + rainAlpha > 0.01) {
          weatherTint
            .rect(0, 0, options.worldWidth, options.worldHeight)
            .fill({ color: NIGHT_COLOR, alpha: Math.min(0.84, nightAlpha + rainAlpha) });
        }
      }

      // Poeirinha dos passos: sobe, desacelera e some.
      dustTimer -= dt;
      if (dustTimer <= 0) dustTimer = DUST_INTERVAL;
      for (let i = dust.length - 1; i >= 0; i--) {
        const particle = dust[i]!;
        particle.life -= dt;
        if (particle.life <= 0) {
          particleLayer.removeChild(particle.sprite);
          dustPool.push(particle.sprite);
          dust.splice(i, 1);
          continue;
        }
        particle.sprite.position.x += particle.vx * dt;
        particle.sprite.position.y += particle.vy * dt;
        particle.vy *= 0.92;
        particle.sprite.alpha = particle.life * 1.1;
      }

      // Folhas caindo.
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i]!;
        leaf.y += leaf.vy * dt;
        leaf.phase += dt;
        const drawX = leaf.x + Math.sin(leaf.phase) * leaf.sway;
        if (leaf.y > options.worldHeight + 8) {
          leaf.y = -8;
          leaf.x = Math.random() * options.worldWidth;
        }
        leaf.sprite.position.set(isoX(drawX, leaf.y), isoY(drawX, leaf.y));
        leaf.sprite.rotation += leaf.spin * dt;
      }
    },

    destroy(): void {
      destroyed = true;
      creatureSlots.clear();
      resourceSprites.length = 0;
      waterSprites.length = 0;
      leaves.length = 0;
      dust.length = 0;
      dustPool.length = 0;
      ambientSprites.length = 0;
      rainDrops.length = 0;
      tallProps.length = 0;
      treeSprites.length = 0;
      reflections.length = 0;
      ripples.length = 0;
      for (const frame of tintimFrames) frame.destroy();
      tintimFrames = [];
      if (app) {
        app.destroy(true, { children: true });
        app = null;
        worldLayer = null;
        sandLayer = null;
        waterLayer = null;
        decorationLayer = null;
        resourceLayer = null;
        shadowG = null;
        selectionG = null;
        creatureLayer = null;
        particleLayer = null;
        ambientLayer = null;
        glowLayer = null;
        rainLayer = null;
        puddleG = null;
        weatherTint = null;
        groundPropLayer = null;
        rippleG = null;
        rainbowG = null;
        itemLayer = null;
        hiddenItemLayer = null;
        reflectionLayer = null;
      }
    },
  };
}
