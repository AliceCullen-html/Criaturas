import { Application, Container, Graphics, Matrix, Sprite, Text, type Texture } from 'pixi.js';
import {
  INTENT_NAMES,
  MOOD,
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
import { FACING, headingOf, type Heading } from './textures/tintimSheet';
import { AnimationController } from './anim/AnimationController';
import {
  ANCHOR_X,
  ANCHOR_Y,
  BODY_HEIGHT,
  loadClipCatalog,
  type ClipCatalog,
} from './anim/clipCatalog';
import { PRIORITY, type CreatureSignals } from './anim/states';
import { loadTerrainArt } from './textures/terrainSheet';
import {
  makeDustTexture,
  makeLeafTextures,
  makeResourceTextures,
  makeSandTexture,
  makeSceneryTextures,
  makeWaterTextures,
  type SceneryTextures,
} from './textures/world';
import { loadBallTextures, loadIconTextures } from './textures/toolIcons';
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
  /**
   * Quem responde se a ferramenta na mão levanta objetos.
   *
   * O renderer não sabe o que é um cinto de ferramentas — ele só pergunta, na
   * hora de fechar a mão, se aquilo pega. É a camada de cima que sabe o quê.
   */
  setGrabTest(test: () => boolean): void;
  /**
   * Quem responde se um toque no chão, com alguém selecionado, é uma ORDEM.
   *
   * Existe por um conflito de verdade: depois que o cinto chegou, um toque no
   * chão com uma criatura selecionada virava ordem de andar e a ferramenta na
   * mão não fazia nada — a bola não caía, o presente não aparecia. Mandar é
   * gesto de mão VAZIA; com um objeto na mão, o toque é o objeto.
   */
  setOrderTest(test: () => boolean): void;
  /**
   * Quem responde QUAL DESENHO está na mão do jogador dentro do jardim.
   *
   * Devolve o índice do ícone no atlas, ou -1 para a mão nua. É o que faz o
   * cursor virar a ferramenta de verdade: a seta do sistema não entra no
   * jardim (o canvas a esconde), então quem mostra o que você está segurando é
   * este desenho, aqui dentro do mundo, no tamanho e na luz do mundo.
   */
  setToolIcon(pick: () => number): void;
  /**
   * Quem responde se um gesto brusco MACHUCA.
   *
   * Só a mão nua bate. Com a esponja, a maçã ou o livro, esfregar depressa é
   * esfregar depressa — antes, uma esfregada de banho com vontade era
   * registrada como pancada, e o jogador assustava a criatura tentando cuidar
   * dela.
   */
  setRoughTest(test: () => boolean): void;
  /** Sinal visual acima de uma criatura (coração, gota, estrela...). */
  emit(kind: FeedbackKind, worldX: number, worldY: number): void;
  /** Alguém disse uma palavra: aparece uma bolha com ela por cima da cabeça. */
  say(word: number, worldX: number, worldY: number): void;
  /**
   * Aponta a câmera para um ponto do mundo, uma vez.
   *
   * Não é seguir: é olhar. Existe porque o jogo abre com UM ovo parado num
   * jardim de novecentos por novecentos — e uma coisa que o jogador não acha
   * é uma coisa que não existe. Depois disso a câmera é dele.
   */
  lookAt(worldX: number, worldY: number): void;
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
/**
 * Raios, em fração do tamanho da criatura, medidos NO MUNDO.
 *
 * Como a camada do chão achata tudo por 2:1, o que se vê na tela é uma elipse
 * de largura 1,41× o raio e altura 0,71× — por isso os números parecem
 * pequenos para o desenho que sai.
 */
const SHADOW_RADIUS = 0.44;
const RING_RADIUS = 0.95;
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
/**
 * Índices de `PROP` em @world. Cópia local pelo mesmo motivo de sempre: o
 * desenho não importa a simulação, e os dois combinaram este vocabulário.
 */
const PROP_GRASS_TALL = 0;
const PROP_GRASS_LOW = 1;
const PROP_FLOWER = 2;
const PROP_LOG = 6;
const PROP_REED = 9;
/** Quadros de vento por segundo. Lento: é brisa, não ventania. */
const WIND_SPEED = 3.5;
/** Os três gramados da folha, na ordem em que ela os traz. */
const GRASS_LIGHT = 0;
const GRASS_MID = 1;
const GRASS_DARK = 2;
/** Água rasa da margem: mais clara que o fundo do lago. */
const SHALLOW_TINT = 0xb9e2f2;
/** O quanto o arco-íris é achatado em relação a um semicírculo perfeito. */
const RAINBOW_SQUASH = 0.62;

/**
 * A VIDA DE FUNDO — o pouco que ainda é feito por código.
 *
 * Aqui existiam duas tabelas: uma que dizia como o corpo se mexe em cada
 * HUMOR e outra que dizia como ele se mexe em cada POSE — trinta e tantos
 * gestos escritos em seno e cosseno, porque na época o desenho era um quadro
 * parado e a única animação possível era deformar esse quadro.
 *
 * Agora cada estado é uma animação desenhada à mão, com quadros próprios, e
 * insistir na deformação por cima seria animar duas vezes: o corpo pulando no
 * desenho e o sprite inteiro pulando junto. As duas tabelas saíram, e no lugar
 * delas ficou só a RESPIRAÇÃO — discreta, com o tempo de cada criatura, para
 * que nem no quadro mais parado ela fique completamente imóvel. O resto da
 * promessa de "nunca parada" é das microanimações do ocioso, que são desenho e
 * não conta.
 */
function breathOf(t: number, seed: number): number {
  return 1 + Math.sin(t * 2.4 + seed) * 0.03;
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

/**
 * As variantes de objeto que vêm do atlas de ícones, e qual ícone é cada uma.
 *
 * Cópia local dos números de `VARIANT` (@world) e `ICON` (@core): o renderer
 * não importa a simulação nem o mundo, e nunca importou. É uma tabela pequena e
 * o preço de manter a fronteira.
 */
const ICON_FOR_VARIANT: Record<number, number> = {
  15: 1, // bola
  16: 10, // ursinho
  17: 11, // flor
  18: 12, // almofada
  19: 13, // pedra bonita
  20: 14, // pena
};

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
 * Divisor do tamanho que dá a escala do sprite.
 *
 * A folha de animação é exportada em 4×: o corpo tem 72 pixels de textura para
 * 18 de desenho. Vinte e nove é o número que devolve à criatura EXATAMENTE a
 * altura que ela tinha na folha antiga (16 px a 6,5 de divisor, isto é, duas
 * vezes e meia o tamanho dela no mundo) — a arte mudou, o tamanho do bicho no
 * jardim não.
 */
const CREATURE_SCALE = 29;
/**
 * A que distância do centro do corpo fica a sola do pé, em fração do tamanho.
 * É o mesmo número que posiciona a sombra: os dois têm de bater, senão a
 * criatura descola do chão.
 */
const GROUND_CONTACT = 0.42;
const DUST_INTERVAL = 0.22;

/**
 * Uma criatura na tela.
 *
 * DOIS sprites, não um. O de cima é a animação que está tocando; o de baixo é a
 * que está saindo, enquanto a travessia dura. Sem o segundo, trocar de estado
 * seria um corte seco de textura — e é justamente o corte seco que faz um jogo
 * parecer feito de bonecos trocados por um interruptor.
 *
 * Quem escolhe O QUE tocar é o `AnimationController`: ele olha para os sinais
 * da criatura (intenção, humor, medo, cicatriz, velocidade) e resolve o estado,
 * a travessia, a fila e as microanimações. O slot aqui só desenha o que ele
 * disser.
 */
interface CreatureSlot {
  container: Container;
  sprite: Sprite;
  /** O sprite de baixo, onde a animação que está saindo termina de sumir. */
  fading: Sprite;
  anim: AnimationController;
  facing: number;
  seen: number;
  /** Onde ela estava no quadro anterior, para medir a velocidade de verdade. */
  lastX: number;
  lastY: number;
  /** Defasagem própria do relógio de respiração. */
  phase: number;
  /**
   * O rumo em que ela está virada. Guardado entre quadros porque ele sobrevive
   * à parada: ela para virada para onde estava indo, e só depois se volta.
   */
  heading: Heading;
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
  kind: FeedbackKind;
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
  /**
   * TODAS as animações da criatura, lidas da pasta na abertura do jogo.
   *
   * Não existe lista escrita em lugar nenhum: o catálogo é a pasta. Pôr um PNG
   * novo em `assets/creatures/animations/` basta para o jogo passar a conhecer
   * a animação — e a máquina de estados a pedir pelo nome.
   */
  let clips: ClipCatalog = new Map();
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
  /**
   * O RELÓGIO DO VENTO.
   *
   * Cada peça que o vento mexe guarda os seis quadros dela e uma defasagem
   * própria. Sem a defasagem o jardim inteiro balançaria no mesmo instante,
   * que é a cara de um papel de parede se repetindo; com ela, cada árvore tem
   * o seu tempo e o mato parece mato.
   */
  /** Ciclos de vento por tipo de cenário e por variante. */
  let sceneryWind: Record<string, Texture[][]> = {};
  /** E por tipo de prop — o índice é o `PROP` de @world. */
  let propWind: Array<Texture[] | undefined> = [];
  const windy: Array<{ sprite: Sprite; frames: Texture[]; phase: number }> = [];
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
  /** Pergunta feita à camada de cima: a ferramenta atual pega coisas? */
  let canGrab: () => boolean = () => true;
  /** E manda? Com um objeto na mão, tocar o chão é usar o objeto, não mandar. */
  let canOrder: () => boolean = () => true;
  /** E machuca? Só a mão nua. */
  let canHurt: () => boolean = () => true;
  /** Qual ícone está na mão do jogador (-1 = a mão nua). */
  let toolIcon: () => number = () => -1;
  /** Os quinze ícones desenhados à mão, para o cursor dentro do mundo. */
  let iconTextures: Texture[] | null = null;
  let dustTexture: Texture | null = null;
  let feedbackTextures: Record<FeedbackKind, Texture> | null = null;
  let handTextures: Record<HandState, Texture> | null = null;
  let handSprite: Sprite | null = null;
  let dustTimer = 0;
  let frameId = 0;
  let lastTime = 0;
  let elapsed = 0;

  /**
   * Os sinais de UMA criatura, reaproveitados a cada quadro. Ver o preenchimento
   * no laço de desenho: eles morrem dentro da chamada que os consome.
   */
  const signals: CreatureSignals = {
    intent: 'wander',
    pose: 0,
    mood: 0,
    moving: false,
    speed: 0,
    carrying: false,
    scar: 0,
    fear: 0,
    happiness: 0.5,
    energy: 1,
    health: 1,
    touched: false,
    hatching: -1,
    isBaby: false,
  };
  /** Onde a criatura que está tocando uma animação está, para as partículas. */
  const emitAt = { x: 0, y: 0, size: 8 };
  /** Quem a mão do jogador está acariciando agora, se alguém. */
  let pettingId: number | null = null;

  /** Toca uma animação AGORA no corpo de uma criatura, se ela estiver na tela. */
  function gestureOn(
    creatureId: number,
    key: string,
    priority: number = PRIORITY.interaction,
  ): boolean {
    return creatureSlots.get(creatureId)?.anim.trigger(key, { priority }) ?? false;
  }

  /** A mesma coisa, mas para quem só sabe ONDE a coisa aconteceu. */
  function gestureAt(worldX: number, worldY: number, key: string): void {
    const id = pickCreature(worldX, worldY);
    if (id !== null) gestureOn(id, key);
  }

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

  /**
   * Sinal visual efêmero (coração, gota, estrela) subindo sobre uma criatura.
   *
   * `once` pede que ele NÃO se empilhe: enquanto um sinal igual estiver no ar
   * ali perto, o novo não nasce. É o que separa um pedido do jogo — que tem de
   * aparecer sempre — de um sinal de animação, que sai a cada volta do laço:
   * uma criatura assustada por dez segundos renderia dezesseis interrogações
   * empilhadas na cabeça dela, e uma coluna de símbolos não é susto, é defeito.
   */
  function signal(kind: FeedbackKind, worldX: number, worldY: number, once = false): void {
    if (!particleLayer || !feedbackTextures || feedback.length > 40) return;
    const spotX = isoX(worldX, worldY);
    const spotY = isoY(worldX, worldY);
    if (once) {
      for (const alive of feedback) {
        if (alive.kind !== kind) continue;
        if (
          Math.abs(alive.sprite.position.x - spotX) < 26 &&
          Math.abs(alive.sprite.position.y - spotY) < 40
        ) {
          return;
        }
      }
    }
    const sprite = new Sprite(feedbackTextures[kind]);
    sprite.anchor.set(0.5, 1);
    sprite.position.set(spotX, spotY);
    particleLayer.addChild(sprite);
    feedback.push({ sprite, life: 1.4, maxLife: 1.4, kind });
  }

  /**
   * UM QUADRO MARCADO PASSOU.
   *
   * É aqui que a animação encosta no resto do jogo: a poeira sai no quadro em
   * que o pé bate no chão, a espuma no quadro em que a mão esfrega, a fagulha
   * no quadro em que a criatura entende a palavra. Sem isto, partícula e
   * desenho correm em relógios diferentes e a poeira sai com a pata no ar —
   * que é o defeito que faz um jogo parecer montado com peças de outro.
   *
   * Quem diz QUAIS quadros são marcados é a tabela `FRAME_EVENTS`, ao lado do
   * controlador; aqui só se decide o que cada marca vira na tela. Um evento
   * sem tradução visual — a mordida, o gole — não é esquecimento: é o lugar
   * onde o som vai entrar quando houver som, e a tabela já o está anunciando.
   */
  function playFrameEvent(emit: string, x: number, y: number, size: number): void {
    const foot = size * GROUND_CONTACT * ISO_SQUASH;
    switch (emit) {
      case 'footstep':
      case 'ballHit':
        spawnDust(x + foot, y + foot, size);
        break;
      case 'bubble':
        signal('bubble', x, y, true);
        break;
      case 'droplets':
      case 'sip':
      case 'tear':
      case 'sneeze':
        signal('drop', x, y, true);
        break;
      case 'heart':
        signal('heart', x, y, true);
        break;
      case 'spark':
      case 'star':
        signal('star', x, y, true);
        break;
      case 'startle':
        signal('question', x, y, true);
        break;
      default:
        break;
    }
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
  const screenToWorld = (
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ): { x: number; y: number } =>
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
   * A MÃO AINDA ESTÁ EM CIMA DAQUELA criatura?
   *
   * Mais frouxo que `pickCreature` de propósito, e por dois motivos práticos.
   * Uma criatura tem dezesseis pixels; esfregar é um gesto largo, e a esponja
   * sai de cima dela a cada ida e volta. E ela ANDA — dar banho num bicho que
   * caminha exigia perseguir o desenho pixel a pixel, o que na prática
   * significava que ninguém conseguia dar banho.
   *
   * Aqui a pergunta é outra: "a mão continua junto dela?". O retângulo do
   * desenho cresce à volta, e a resposta acompanha a criatura enquanto ela se
   * move — é o contato que segue o corpo, e não o corpo que precisa ficar
   * parado embaixo do cursor.
   */
  function stillTouching(worldX: number, worldY: number, id: number): boolean {
    const buffer = lastCreatures;
    if (!buffer) return false;
    for (let i = 0; i < buffer.count; i++) {
      if (buffer.id[i] !== id) continue;
      const box = creatureBox(buffer.size[i]!);
      return insideSprite(
        worldX,
        worldY,
        buffer.x[i]!,
        buffer.y[i]!,
        box.halfWidth * TOUCH_SLACK,
        box.up * TOUCH_SLACK,
        box.down * TOUCH_SLACK,
      );
    }
    return false;
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

  /** O quanto o alvo cresce quando a mão JÁ está em contato com a criatura. */
  const TOUCH_SLACK = 1.9;

  /**
   * O retângulo que a criatura ocupa na tela, medido a partir do seu ponto no
   * mundo. Uma conta só, usada pelo clique e por quem precisar mirar nela.
   */
  function creatureBox(size: number): { halfWidth: number; up: number; down: number } {
    const height = BODY_HEIGHT * (size / CREATURE_SCALE);
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
      if (!insideSprite(worldX, worldY, piece.x, piece.y, box.halfWidth, box.up, box.down))
        continue;
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
        zoomAt(
          event.clientX - rect.left,
          event.clientY - rect.top,
          event.deltaY < 0 ? 1.12 : 1 / 1.12,
        );
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

      // A FOLHA DO TERRENO, desenhada à mão: o chão, as árvores, as moitas e o
      // mato — cada um com os seis quadros de vento dele.
      const art = await loadTerrainArt();

      // O DESENHO DO CENÁRIO PASSA A SER A FOLHA.
      //
      // O procedural fica só onde a folha não chegou: o computador, que não é
      // natureza e não foi desenhado nela. Árvore, moita e pedra vêm da mão do
      // artista, com os quadros de vento junto.
      const trees = [art.wind.tree, art.wind.fruitTree];
      const bushes = [art.wind.bush, art.wind.mushroom];
      sceneryWind = { tree: trees, bush: bushes, rock: [[art.statics.rock]], computer: [] };
      scenery = {
        ...scenery,
        tree: trees.map((frames) => frames[0]!),
        bush: bushes.map((frames) => frames[0]!),
        rock: [art.statics.rock],
      };

      // E O MATO TAMBÉM. O procedural continua nas peças que a folha não traz
      // — pedrinha, raiz, folha caída, musgo, vitória-régia, concha —, e essas
      // são justamente as que não balançam.
      propWind = [];
      propWind[PROP_GRASS_TALL] = art.wind.tallGrass;
      propWind[PROP_GRASS_LOW] = art.wind.grass;
      propWind[PROP_FLOWER] = art.wind.flower;
      propWind[PROP_REED] = art.wind.reed;
      propTextures = propTextures.map((variants, kind) =>
        propWind[kind] ? [propWind[kind]![0]!] : variants,
      );
      propTextures[PROP_LOG] = [art.statics.log];
      // AS ANIMAÇÕES DA CRIATURA — a pasta inteira, de uma vez.
      clips = await loadClipCatalog();

      // A bola e os presentes NÃO são desenhados por código: são os ícones
      // desenhados à mão, os mesmos do cinto e do cursor. O que o jogador
      // segura e o que ele larga na grama têm de ser a mesma coisa.
      const icons = await loadIconTextures();
      iconTextures = icons;
      for (const [variant, icon] of Object.entries(ICON_FOR_VARIANT)) {
        const texture = icons[icon];
        if (texture) resourceTextures[Number(variant)] = texture;
      }

      // Os seis quadros da bola entram como variantes 21 a 26: quem escolhe
      // qual deles aparece é a FÍSICA, lá no mundo, não o desenho.
      const ballFrames = await loadBallTextures();
      for (let i = 0; i < ballFrames.length; i++) resourceTextures[21 + i] = ballFrames[i]!;

      const root = new Container();
      root.sortableChildren = false;

      // O PISO.
      //
      // Um sprite quadrado por casa do piso, desenhado no container do chão —
      // que carrega a matriz isométrica. Ou seja: aqui só existem quadrados, e é
      // o Pixi que os entrega em losango. As variantes são sorteadas com semente
      // fixa, então o mesmo mundo tem sempre o mesmo gramado.
      //
      // E a casa do piso NÃO é a casa do tabuleiro. O tabuleiro (`TILE`) é regra
      // de jogo: uma árvore por casa, uma pedra por casa, é ele que a peça
      // arrastada procura. O piso é desenho, e desenhado na mesma medida ele
      // fica com cara de tabuleiro de xadrez gigante — losangos enormes, a
      // criatura minúscula em cima de um deles. Miúdo, o chão vira textura: a
      // grade some para o fundo e o bicho volta a ser o assunto da tela.
      // O CHÃO É DESENHADO À MÃO, UM LOSANGO POR CASA.
      //
      // E fica numa camada EM PÉ, não na do chão. Os losangos da folha já vêm
      // desenhados em perspectiva; passá-los pela matriz isométrica seria
      // projetar duas vezes e transformar cada casa num rombo torto. Aqui só a
      // POSIÇÃO é projetada — que é a mesma regra das árvores e das criaturas.
      //
      // A casa do piso é a casa do TABULEIRO: a arte foi desenhada nessa
      // medida (96×48 para uma casa de 50, uma diferença de quatro por cento
      // que a escala resolve), e é por isso que a árvore preenche a casa dela
      // como no papel.
      const tiles = new Container();
      const tileRng = createRng(0x7a11e);
      const gridCols = Math.ceil(options.worldWidth / TILE);
      const gridRows = Math.ceil(options.worldHeight / TILE);
      const tileArt = art.tiles;
      // Um pelinho maior que a casa: sem essa sobra fica uma linha de fundo
      // aparecendo entre um losango e o vizinho.
      const tileScale = ((TILE * 2) / (tileArt[0]?.width ?? 96)) * 1.02;
      // XADREZ, como antes: as claras e as escuras se alternam pela paridade
      // da casa e o sorteio só escolhe QUAL. É o que faz o gramado ler como
      // padrão em vez de borrão.
      const claras = [GRASS_LIGHT, GRASS_MID];
      const escuras = [GRASS_MID, GRASS_DARK];
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const paridade = (col + row) % 2 === 0 ? claras : escuras;
          const texture = tileArt[paridade[tileRng.int(paridade.length)]!];
          if (!texture) continue;
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5, 0.5);
          sprite.scale.set(tileScale);
          const cx = (col + 0.5) * TILE;
          const cy = (row + 0.5) * TILE;
          sprite.position.set(isoX(cx, cy), isoY(cx, cy));
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
      ground.addChild(sand, water, reflections, ripplesG, puddles, tileCursor, shadows, selection);

      // O QUE FICA EM PÉ não é inclinado — só a POSIÇÃO é projetada. Uma
      // criatura girada 45 graus não é isométrica, é uma criatura tombada.
      const upright = new Container();
      upright.sortableChildren = true;
      // Cenário e criaturas na MESMA camada ordenada. Em vista isométrica, uma
      // árvore que está atrás não pode ser desenhada por cima de quem está na
      // frente — e com camadas separadas isso era inevitável.
      upright.addChild(groundProps, hiddenItems, resources, creatures, itemsLayer, marqueeRect);

      root.addChild(tiles, ground, upright, ambient, particles, rain, tint, glow, rainbow, hand);
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
      windy.length = 0;
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
        // O ciclo de vento daquela peça, se ela tiver um. A defasagem sai da
        // POSIÇÃO: duas árvores vizinhas balançam quase juntas, uma do outro
        // lado do jardim balança em outro tempo — é o vento atravessando.
        const cycles = sceneryWind[piece.kind];
        const frames = cycles?.[piece.variant % Math.max(1, cycles.length)];
        if (frames && frames.length > 1) {
          windy.push({ sprite, frames, phase: (piece.x * 0.7 + piece.y * 1.3) * 0.05 });
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
      // Os props somem junto com a camada; o cenário tem lista própria e é
      // remontado noutro lugar, então aqui só saem os que são de prop.
      for (let i = windy.length - 1; i >= 0; i--) {
        if (!windy[i]!.sprite.parent) windy.splice(i, 1);
      }

      for (const prop of props) {
        const variants = propTextures[prop.kind];
        if (!variants || variants.length === 0) continue;
        const sprite = new Sprite(variants[prop.variant % variants.length]!);
        sprite.anchor.set(0.5, 0.9);
        sprite.position.set(isoX(prop.x, prop.y), isoY(prop.x, prop.y));
        const frames = propWind[prop.kind];
        if (frames && frames.length > 1) {
          windy.push({ sprite, frames, phase: prop.phase });
        }
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

    setGrabTest(test: () => boolean): void {
      canGrab = test;
    },

    setOrderTest(test: () => boolean): void {
      canOrder = test;
    },

    setToolIcon(pick: () => number): void {
      toolIcon = pick;
    },

    setRoughTest(test: () => boolean): void {
      canHurt = test;
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

        // O QUE O JOGADOR FAZ, NO CORPO DELA — na hora, sem esperar o próximo
        // passo da simulação.
        //
        // Estes três não são estados: são acontecimentos. O estado descreve o
        // que a criatura ESTÁ fazendo e volta sozinho quando o gesto acaba; o
        // tapa e o cheiro da fruta na cara são instantes, e instante é o que a
        // fila de animação sabe tocar por cima de tudo e devolver o comando
        // depois. É por isso que o motor tem `trigger` e prioridade: sem eles,
        // bater numa criatura só mudaria um número, e ela continuaria andando
        // como se nada tivesse acontecido até a simulação reparar.
        onRough: (creatureId, speed, dirX, dirY) => {
          gestureOn(creatureId, 'tapa', PRIORITY.urgent);
          next.onRough(creatureId, speed, dirX, dirY);
        },
        onCall: (creatureId) => {
          gestureOn(creatureId, 'ouvirPalavra');
          next.onCall(creatureId);
        },
        onOffer: (itemId, creatureId) => {
          gestureOn(creatureId, 'cheirarComida');
          next.onOffer(itemId, creatureId);
        },
      };
      gestures = new GestureRecognizer(watched, {
        creatureAt: pickCreature,
        stillTouching,
        canGrab: () => canGrab(),
        canHurt: () => canHurt(),
        hasSelection: () => selectedNow.size > 0 && canOrder(),
        itemAt: pickItem,
        sceneryAt: pickScenery,
        isWater: (x, y) => waterProbe?.(x, y) ?? false,
      });
    },

    emit(kind: FeedbackKind, worldX: number, worldY: number): void {
      signal(kind, worldX, worldY);
    },

    lookAt(worldX: number, worldY: number): void {
      camera.isoX = isoX(worldX, worldY);
      camera.isoY = isoY(worldX, worldY);
    },

    say(word: number, worldX: number, worldY: number): void {
      if (!particleLayer || bubbles.length > 16) return;
      const text = WORD_TEXT[word];
      if (!text) return;
      // QUEM FALA, FALA COM O CORPO. A bolha por si só é uma legenda flutuando
      // no ar; com a animação junto, é a criatura dizendo.
      gestureAt(worldX, worldY, 'falar');
      // A MESMA PALAVRA NÃO SE EMPILHA.
      //
      // Uma bolha sobe devagar e fica dois segundos no ar; dizer a mesma coisa
      // outra vez antes disso montava uma coluna de palavras iguais sobre a
      // cabeça da criatura — que é o desenho de um jogo travado, não o de
      // alguém falando. Enquanto a primeira ainda está no ar, a repetição não
      // vira bolha nova.
      const spotX = isoX(worldX, worldY);
      const spotY = isoY(worldX, worldY) - 16;
      for (const alive of bubbles) {
        if (alive.text.text !== text) continue;
        if (
          Math.abs(alive.text.position.x - spotX) < 40 &&
          Math.abs(alive.text.position.y - spotY) < 60
        ) {
          return;
        }
      }
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
      bubble.position.set(spotX, spotY);
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

      // O PEDAÇO DE MUNDO QUE ESTÁ NA TELA, em coordenadas desta camada.
      //
      // Existe por causa de um defeito que só aparecia à noite: a escuridão era
      // um retângulo de (0,0) até (largura, altura) do mundo — coordenadas NÃO
      // projetadas. Depois que a vista virou isométrica, o mundo desenhado é um
      // losango que vai de -altura a +largura no eixo X, e aquele retângulo
      // passou a cobrir um pedaço torto da tela: metade do jardim anoitecia e a
      // outra metade ficava em pleno dia, separadas por uma linha reta.
      //
      // Nada que cobre a tela — a noite, a chuva — pertence a um lugar do
      // mundo. Essas coisas se desenham AQUI, na vista, e por isso continuam
      // certas em qualquer zoom e em qualquer canto para onde a câmera vá.
      const viewWidth = screenWidth / camera.zoom;
      const viewHeight = screenHeight / camera.zoom;
      const viewLeft = camera.isoX - viewWidth / 2;
      const viewTop = camera.isoY - viewHeight / 2;

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
      // QUEM ESTÁ SENDO ACARICIADO — uma pergunta por quadro, não uma por
      // criatura. É o sinal que faz a criatura tocar `afagar` enquanto a mão
      // do jogador estiver nela, e parar quando ela sair.
      pettingId =
        handWorld.inside && gestures?.handState === 'petting'
          ? pickCreature(handWorld.x, handWorld.y)
          : null;
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
          const fading = new Sprite();
          const sprite = new Sprite();
          // Âncora no CORPO, não no meio do quadro: o quadro é largo para caber
          // a mão do jogador e o amigo do lado, e o bicho mora na esquerda dele.
          fading.anchor.set(ANCHOR_X, ANCHOR_Y);
          sprite.anchor.set(ANCHOR_X, ANCHOR_Y);
          container.addChild(fading, sprite);
          creatureLayer.addChild(container);
          slot = {
            container,
            sprite,
            fading,
            anim: new AnimationController({
              has: (key) => clips.has(key),
              frameCount: (key) => clips.get(key)?.frames.length ?? 1,
              onEvent: (emit) => playFrameEvent(emit, emitAt.x, emitAt.y, emitAt.size),
            }),
            facing: 1,
            seen: frameId,
            phase: (id % 17) * 0.41,
            lastX: cx,
            lastY: cy,
            heading: { facing: FACING.s, mirror: false },
          };
          creatureSlots.set(id, slot);
        }

        // Quanto ela andou desde o quadro passado, na posição JÁ interpolada.
        //
        // É daqui que sai a velocidade que a máquina de estados usa para
        // separar o passo da corrida e para acertar o compasso do ciclo. Medir
        // com `x - prevX` seria medir o passo de um TICK da simulação (vinte
        // por segundo) enquanto o desenho roda a sessenta: a conta sai três
        // vezes maior e toda criatura parece estar correndo.
        const movedNow = Math.hypot(cx - slot.lastX, cy - slot.lastY);
        // Para ONDE ela andou, em coordenadas de tela. O passo é medido no
        // mundo, mas a direção que o jogador vê é a projetada: andar para o
        // leste do mundo, aqui, é subir e ir para a direita.
        const wentX = cx - slot.lastX;
        const wentY = cy - slot.lastY;
        slot.lastX = cx;
        slot.lastY = cy;
        const speed = movedNow / Math.max(dt, 1 / 240);

        // O OVO viaja pelo mesmo buffer: o canal diz o quanto falta para
        // romper, e -1 quer dizer "isto aqui já nasceu".
        const hatching = creatures.egg[i]!;

        // A DIREÇÃO em que ela caminha decide para que lado o desenho olha.
        if (movedNow > 0.001) {
          slot.heading = headingOf(wentX - wentY, (wentX + wentY) * ISO_SQUASH);
        }
        const heading = slot.heading;

        // OS SINAIS DA CRIATURA, do jeito que a máquina de estados os pede.
        //
        // Um objeto só, reaproveitado a cada criatura e a cada quadro: ele é
        // consumido dentro do `update` e não sobrevive à chamada. Com trezentas
        // criaturas a sessenta quadros, criar um objeto novo aqui seria criar
        // dezoito mil por segundo para o coletor de lixo recolher.
        signals.intent = INTENT_NAMES[creatures.intent[i]!] ?? 'wander';
        signals.pose = creatures.pose[i]!;
        signals.mood = mood;
        signals.moving = moving;
        signals.speed = speed;
        signals.carrying = creatures.carrying[i] === 1;
        signals.scar = creatures.scar[i]!;
        signals.fear = creatures.fear[i]!;
        signals.happiness = creatures.happiness[i]!;
        signals.energy = creatures.energy[i]!;
        signals.health = creatures.health[i]!;
        signals.touched = pettingId === id;
        signals.hatching = hatching;
        signals.isBaby = stage === 0;

        // Onde as partículas de quadro vão sair. Lido pelo `onEvent` do slot,
        // que dispara lá dentro do `update` — logo abaixo, no mesmo instante.
        emitAt.x = cx;
        emitAt.y = cy;
        emitAt.size = size;
        slot.anim.update(signals, dt);

        // O QUE DESENHAR: o que o controlador disser, e nada além disso.
        const view = slot.anim.view();
        const frames = view ? clips.get(view.key)?.frames : undefined;
        const texture = frames?.[view!.frame];
        if (texture && slot.sprite.texture !== texture) slot.sprite.texture = texture;

        // A TRAVESSIA, desenhada: a animação que sai continua na tela por um
        // instante, sumindo por baixo da que entra. É o que tira o "corte
        // seco" da troca de estado — sem isto, parar de correr é um estalo.
        const leaving = view?.fadingKey ? clips.get(view.fadingKey)?.frames : undefined;
        if (leaving && view) {
          const old = leaving[Math.min(view.fadingFrame, leaving.length - 1)];
          if (old && slot.fading.texture !== old) slot.fading.texture = old;
          slot.fading.visible = true;
          slot.fading.alpha = 1 - view.blend;
          slot.sprite.alpha = view.blend;
        } else if (slot.fading.visible) {
          slot.fading.visible = false;
          slot.sprite.alpha = 1;
        }

        // De que lado ela está virada.
        //
        // Andando, quem decide é o rumo: a folha tem um perfil só, e o outro é
        // o espelho dele. Parada, vale o último movimento — ou a mão do
        // jogador, se ela estiver curiosa, porque um bicho curioso encara.
        if (moving) slot.facing = heading.mirror ? -1 : 1;
        else if (dx > 0.05) slot.facing = 1;
        else if (dx < -0.05) slot.facing = -1;
        else if (mood === MOOD.curious && handWorld.inside) {
          slot.facing = handWorld.x >= cx ? 1 : -1;
        }

        // A RESPIRAÇÃO — o único movimento que ainda é conta, e de propósito
        // quase invisível: o resto do corpo se mexe porque foi DESENHADO se
        // mexendo. Cada criatura no seu tempo, senão o jardim inteiro infla e
        // desinfla em uníssono.
        const scale = size / CREATURE_SCALE;
        const breath = breathOf(elapsed + slot.phase, slot.phase);
        slot.container.scale.set(slot.facing * scale, scale * breath);
        slot.container.rotation = 0;

        // O PÉ NO CHÃO.
        //
        // A posição da criatura no mundo é o centro do corpo, não a sola do
        // pé — é com o centro que a simulação faz colisão. A sombra sempre foi
        // desenhada embaixo desse centro, à distância do raio do corpo. O
        // desenho desce a mesma distância: sem isso a criatura fica com os pés
        // acima da própria sombra, que é exatamente a cara de quem flutua.
        slot.container.position.set(
          isoX(cx, cy),
          isoY(cx, cy) + size * GROUND_CONTACT * ISO_SQUASH,
        );
        slot.container.zIndex = isoDepth(cx, cy);

        slot.seen = frameId;

        // O PÉ DELA, em coordenadas do mundo.
        //
        // A criatura é posicionada pelo CENTRO do corpo (é com o centro que a
        // simulação faz colisão), e o desenho desce um tanto para os pés
        // encostarem no chão. Tudo que acompanha os pés — sombra, poeira, anel
        // de seleção — desce o mesmo tanto, e nos DOIS eixos: no mundo, mexer
        // só no y empurra o desenho na diagonal; nos dois, ele desce reto na
        // tela, que é para onde o corpo desceu.
        const foot = size * GROUND_CONTACT * ISO_SQUASH;

        // Poeirinha dos passos, aos pés dela — nos dois eixos, como a sombra.
        if (moving && dustTimer <= 0) {
          spawnDust(cx + foot, cy + foot, size);
        }

        // SOMBRA SUAVE — E DEITADA NO CHÃO DE VERDADE.
        //
        // Um CÍRCULO, não uma elipse. Esta camada carrega a matriz do chão, e
        // é ela que achata o que for desenhado aqui: um círculo do mundo sai
        // como a elipse 2:1 da perspectiva, alinhada com a tela e com o
        // losango das casas. Uma elipse desenhada já achatada sai GIRADA 45
        // graus — e uma sombra torta embaixo de uma criatura em pé é
        // exatamente o que faz parecer que ela está tombada no chão.
        //
        shadowG.ellipse(cx + foot, cy + foot, size * SHADOW_RADIUS, size * SHADOW_RADIUS).fill({
          color: SHADOW_COLOR,
          alpha: 0.24,
        });

        if (id === input.selectedId) {
          selX = cx + foot;
          selY = cy + foot;
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
          const each = creatures.size[i]!;
          const pé = each * GROUND_CONTACT * ISO_SQUASH;
          selectionG
            .ellipse(
              creatures.x[i]! + pé,
              creatures.y[i]! + pé,
              each * RING_RADIUS * pulse,
              each * RING_RADIUS * pulse,
            )
            .stroke({ width: 1.5, color: SELECTION_COLOR, alpha: 0.9 });
        }
      } else if (selFound) {
        selectionG
          .ellipse(selX, selY, selSize * RING_RADIUS * pulse, selSize * RING_RADIUS * pulse)
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
          // Mesma escala da camada de recursos: até agora todo objeto era
          // desenhado duas vezes, uma aqui e outra lá, e o que o jogador via
          // era o de lá. Ao apagar a cópia, o tamanho tinha de continuar o
          // mesmo — senão o jardim inteiro encolheria de repente.
          sprite.scale.set(clamp(items.radius[i]! * 0.16, 0.35, 1.15));
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

      // A MÃO DO JOGADOR DENTRO DO MUNDO — e o que ela está segurando.
      //
      // O canvas esconde a seta do sistema de propósito: quem representa o
      // jogador é este desenho, que vive no mundo, com o tamanho e a luz do
      // mundo. Por isso é AQUI que a ferramenta tem de aparecer. Enquanto só a
      // mãozinha era desenhada, escolher a esponja não mudava nada do que se
      // via dentro do jardim: o cinto dizia "banho" e a mão continuava a mesma.
      //
      // Carregando alguma coisa, volta a mão: o que está na mão é o objeto que
      // ela pegou, e uma esponja fechada em volta de uma fruta seria mentira.
      if (handSprite && handTextures) {
        handSprite.visible = handWorld.inside;
        if (handWorld.inside) {
          const state = gestures?.handState ?? 'open';
          const icon = state === 'holding' ? -1 : toolIcon();
          const tool = icon >= 0 ? iconTextures?.[icon] : null;
          handSprite.texture = tool ?? handTextures[state];
          // Tamanho constante na tela, independente do zoom. O ícone é de
          // 16 px e a mão de 20: o ajuste iguala o peso dos dois na tela.
          handSprite.scale.set((tool ? 1.25 : 1) / camera.zoom);
          // Esfregando, o objeto na mão treme junto — é o gesto do banho.
          const wobble = state === 'petting' ? Math.sin(elapsed * 9) * 1.5 : 0;
          handSprite.position.set(
            isoX(handWorld.x, handWorld.y) + (tool ? Math.sin(elapsed * 9) * wobble * 0.4 : 0),
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
      // O VENTO, QUADRO A QUADRO.
      //
      // Cada planta anda pelos seis desenhos dela no seu próprio tempo. É
      // desenho, não deformação: antes o mundo inteiro balançava girando os
      // sprites alguns graus, o que dobra o pixel e borra a arte. Agora o
      // tronco fica parado e a copa se mexe porque foi DESENHADA se mexendo.
      for (const plant of windy) {
        const step = Math.floor(elapsed * WIND_SPEED + plant.phase) % plant.frames.length;
        const texture = plant.frames[step]!;
        if (plant.sprite.texture !== texture) plant.sprite.texture = texture;
      }

      // A árvore ainda tem o TRANCO de quando alguém a sacode: isso é um
      // acontecimento, não vento, e continua sendo torção.
      for (const tree of treeSprites) {
        if (tree.shake > 0) tree.shake = Math.max(0, tree.shake - dt * 2.2);
        tree.sprite.rotation = tree.shake * Math.sin(elapsed * 26) * 0.09;
      }

      // O reflexo na água nunca fica parado: ondula e respira com a superfície.
      for (const mirror of reflections) {
        const wobble = Math.sin(elapsed * 1.7 + mirror.phase);
        mirror.sprite.skew.x = wobble * 0.09;
        mirror.sprite.scale.y =
          -mirror.scale * (0.86 + Math.sin(elapsed * 1.1 + mirror.phase) * 0.06);
        mirror.sprite.alpha = 0.42 + wobble * 0.06;
      }

      // O toque: quem passa a mão no mato faz o mato balançar. O vento dele
      // já está nos quadros desenhados.
      for (const entry of tallProps) {
        entry.sprite.rotation = entry.view.sway * Math.sin(elapsed * 22) * 0.3;
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
          // Círculo: a onda é redonda NA ÁGUA, e quem a achata é a matriz do
          // chão. Achatá-la aqui a deixaria girada, como a sombra ficava.
          rippleG
            .ellipse(wave.x, wave.y, radius * 0.72, radius * 0.72)
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
          // No meio do jardim PROJETADO. Com as coordenadas cruas do mundo o
          // arco nascia fora do losango, como acontecia com a noite.
          const cx = isoX(options.worldWidth / 2, options.worldHeight / 2);
          const cy = isoY(options.worldWidth * 0.72, options.worldHeight * 0.72);
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
            .ellipse(puddle.x, puddle.y, 8 * puddle.life, 8 * puddle.life)
            .fill({ color: 0x5b90bd, alpha: 0.4 * puddle.life });
        }
      }

      // Chuva: gotas caindo na frente da câmera, não num quadrado do mapa.
      if (rainLayer && rainTextures.length > 0) {
        const wanted = Math.round(input.rain * 170);
        while (rainDrops.length < wanted) {
          const sprite = new Sprite(rainTextures[rainDrops.length % rainTextures.length]!);
          sprite.alpha = 0.65;
          rainLayer.addChild(sprite);
          rainDrops.push({
            sprite,
            x: viewLeft + Math.random() * viewWidth,
            y: viewTop + Math.random() * viewHeight,
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
          // Saiu da vista — caiu embaixo, ou a câmera andou e deixou a gota
          // para trás: volta pelo topo. Chuva é o que se vê chovendo.
          const out =
            drop.y > viewTop + viewHeight ||
            drop.x > viewLeft + viewWidth ||
            drop.x < viewLeft ||
            drop.y < viewTop - viewHeight;
          if (out) {
            drop.y = viewTop - 10;
            drop.x = viewLeft + Math.random() * viewWidth;
          }
          drop.sprite.position.set(drop.x, drop.y);
        }
      }

      // A NOITE. Escurece a tela inteira, junto com a chuva, pela mesma camada.
      //
      // Fica fora do bloco da chuva de propósito: antes a escuridão só era
      // desenhada quando havia textura de gota carregada, então um tropeço no
      // carregamento das gotas levava junto o dia e a noite do jogo.
      if (weatherTint) {
        weatherTint.clear();
        const nightAlpha = input.darkness * 0.78;
        const rainAlpha = input.rain * 0.4;
        if (nightAlpha + rainAlpha > 0.01) {
          // Uma margem de folga: a vista é recalculada por quadro, e sem ela um
          // arredondamento deixaria um fio de dia na borda da tela.
          weatherTint
            .rect(viewLeft - 8, viewTop - 8, viewWidth + 16, viewHeight + 16)
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
      // Um recorte por quadro, mas uma fonte por tira: destruir o primeiro
      // quadro de cada animação devolve a textura inteira à placa de vídeo.
      for (const clip of clips.values()) {
        const source = clip.frames[0]?.source ?? null;
        for (const frame of clip.frames) frame.destroy();
        source?.destroy();
      }
      clips = new Map();
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
