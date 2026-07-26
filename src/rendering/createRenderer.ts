import { Application, Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { clamp, createRng, lerp } from '@core';
import type { CreatureRenderBuffer, RenderBuffer, TileGrid } from '@engine';
import {
  clearCreatureTextureCache,
  decodeFeatures,
  getBodyTexture,
  getFaceTexture,
  type Expression,
  type Features,
  type LifeStage,
} from './textures/creature';
import {
  makeDustTexture,
  makeGrassTexture,
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
import { GestureRecognizer, type GestureHandlers } from './gestures';

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
  followId: number | null;
  /** Ids dos itens, na mesma ordem do buffer `items` (para o hit-test). */
  itemIds: Int32Array;
  /** Bichinhos de ambiente (borboletas, abelhas, pássaros). */
  ambient: readonly AmbientView[];
  /** 0 = tempo bom, 1 = chuva forte. */
  rain: number;
  puddles: ReadonlyArray<{ x: number; y: number; life: number }>;
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
  setHandlers(handlers: GestureHandlers): void;
  /** Sinal visual acima de uma criatura (coração, gota, estrela...). */
  emit(kind: FeedbackKind, worldX: number, worldY: number): void;
  /** Onde a criatura selecionada está NA TELA, para ancorar o cartão. */
  onSelectedScreen(callback: (x: number, y: number, visible: boolean) => void): void;
  frame(input: FrameInput): void;
  destroy(): void;
}

export interface ScenerySpot {
  kind: 'tree' | 'rock' | 'bush';
  x: number;
  y: number;
}

const BACKGROUND_COLOR = 0x2b4a3a;
const SELECTION_COLOR = 0x9be0b4;
const SHADOW_COLOR = 0x101408;
const PIXEL_SCALE = 0.8;
const LEAF_COUNT = 36;
const WATER_FRAME_MS = 220;

/** Índice do humor (vindo da simulação) → expressão facial. */
const EXPRESSIONS: readonly Expression[] = [
  'neutral',
  'happy',
  'needy',
  'sleepy',
  'surprised',
  'angry',
  'sad',
  'loved',
  'afraid',
  'curious',
  'hungry',
  'thirsty',
  'playful',
];

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
  stage: LifeStage,
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

const BLINK_DURATION = 0.11;
const DUST_INTERVAL = 0.22;

/** Uma criatura na tela: corpo estático + rosto que troca com a emoção. */
interface CreatureSlot {
  container: Container;
  body: Sprite;
  face: Sprite;
  features: Features;
  facing: number;
  seen: number;
  stage: number;
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
  let shadowG: Graphics | null = null;
  let selectionG: Graphics | null = null;
  let creatureLayer: Container | null = null;
  let particleLayer: Container | null = null;
  let destroyed = false;

  // Texturas geradas no mount.
  let resourceTextures: Texture[] = [];
  let waterFrames: Texture[] = [];
  let leafTextures: Texture[] = [];
  let scenery: SceneryTextures | null = null;

  const camera = { x: options.worldWidth / 2, y: options.worldHeight / 2, zoom: 1 };
  let fitZoom = 1;
  let cameraReady = false;

  const creatureSlots = new Map<number, CreatureSlot>();
  const resourceSprites: Sprite[] = [];
  const waterSprites: Sprite[] = [];
  const leaves: Leaf[] = [];
  const dust: Dust[] = [];
  const dustPool: Sprite[] = [];
  const itemSprites: Sprite[] = [];
  const feedback: Feedback[] = [];
  let ambientTextures: Texture[][] = [];
  let rainTextures: Texture[] = [];
  const ambientSprites: Sprite[] = [];
  const rainDrops: Array<{ sprite: Sprite; x: number; y: number; speed: number }> = [];
  let ambientLayer: Container | null = null;
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
    sprite.position.set(x, y);
    particleLayer.addChild(sprite);
    dust.push({ sprite, life: 0.45, vx: (Math.random() - 0.5) * 6, vy: -4 - Math.random() * 4 });
  }

  let gestures: GestureRecognizer | null = null;
  let lastCreatures: CreatureRenderBuffer | null = null;
  let lastItems: RenderBuffer | null = null;
  let lastItemIds: Int32Array | null = null;
  const handWorld = { x: 0, y: 0, inside: false };

  const screenToWorldX = (sx: number, sw: number): number => (sx - sw / 2) / camera.zoom + camera.x;
  const screenToWorldY = (sy: number, sh: number): number => (sy - sh / 2) / camera.zoom + camera.y;

  function pickCreature(worldX: number, worldY: number): number | null {
    const buffer = lastCreatures;
    if (!buffer) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < buffer.count; i++) {
      const dx = buffer.x[i]! - worldX;
      const dy = buffer.y[i]! - worldY;
      const dist = dx * dx + dy * dy;
      const reach = Math.max(buffer.size[i]! * 1.7, 16);
      if (dist <= reach * reach && dist < bestDist) {
        bestDist = dist;
        best = buffer.id[i]!;
      }
    }
    return best;
  }

  function pickItem(worldX: number, worldY: number): number | null {
    const buffer = lastItems;
    const ids = lastItemIds;
    if (!buffer || !ids) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < buffer.count; i++) {
      const dx = buffer.x[i]! - worldX;
      const dy = buffer.y[i]! - worldY;
      const dist = dx * dx + dy * dy;
      const reach = Math.max(buffer.radius[i]! * 2.2, 12);
      if (dist <= reach * reach && dist < bestDist) {
        bestDist = dist;
        best = ids[i]!;
      }
    }
    return best;
  }

  function attachInput(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = 'none';
    // A seta do sistema some: quem representa o jogador é a mão desenhada.
    canvas.style.cursor = 'none';

    // Câmera: botão do meio arrasta.
    let panning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panCamX = 0;
    let panCamY = 0;

    const toWorld = (event: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: screenToWorldX(event.clientX - rect.left, app?.screen.width ?? 0),
        y: screenToWorldY(event.clientY - rect.top, app?.screen.height ?? 0),
      };
    };

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      if (event.button === 1) {
        event.preventDefault();
        panning = true;
        panStartX = event.clientX;
        panStartY = event.clientY;
        panCamX = camera.x;
        panCamY = camera.y;
        return;
      }
      const { x, y } = toWorld(event);
      gestures?.pointerDown(x, y, event.timeStamp, event.button);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (panning) {
        camera.x = panCamX - (event.clientX - panStartX) / camera.zoom;
        camera.y = panCamY - (event.clientY - panStartY) / camera.zoom;
        return;
      }
      const { x, y } = toWorld(event);
      handWorld.x = x;
      handWorld.y = y;
      handWorld.inside = true;
      gestures?.pointerMove(x, y, event.timeStamp);
    });

    const endPointer = (event: PointerEvent): void => {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (event.button === 1 || panning) {
        panning = false;
        return;
      }
      const { x, y } = toWorld(event);
      gestures?.pointerUp(x, y, event.timeStamp, event.button);
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('pointerleave', () => {
      handWorld.inside = false;
      gestures?.pointerLeave();
    });

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        if (!app) return;
        const rect = canvas.getBoundingClientRect();
        const sx = event.clientX - rect.left;
        const sy = event.clientY - rect.top;
        const worldX = screenToWorldX(sx, app.screen.width);
        const worldY = screenToWorldY(sy, app.screen.height);
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        camera.zoom = clamp(camera.zoom * factor, fitZoom * 0.8, fitZoom * 10);
        camera.x = worldX - (sx - app.screen.width / 2) / camera.zoom;
        camera.y = worldY - (sy - app.screen.height / 2) / camera.zoom;
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
      rainTextures = makeRainTextures();
      scenery = makeSceneryTextures(createRng(7));

      const root = new Container();
      root.sortableChildren = false;
      const grassTexture = makeGrassTexture(1);
      const grassTile = new TilingSprite({
        texture: grassTexture,
        width: options.worldWidth,
        height: options.worldHeight,
      });
      grassTile.tileScale.set(0.7);
      const sand = new Container();
      const water = new Container();
      const decorations = new Container();
      decorations.sortableChildren = true;
      const resources = new Container();
      const puddles = new Graphics();
      const itemsLayer = new Container();
      const ambient = new Container();
      const rain = new Container();
      const tint = new Graphics();
      const shadows = new Graphics();
      const selection = new Graphics();
      const creatures = new Container();
      const particles = new Container();
      const hand = new Sprite(handTextures.open);
      hand.anchor.set(0.25, 0.15);
      root.addChild(
        grassTile,
        sand,
        water,
        puddles,
        decorations,
        resources,
        shadows,
        selection,
        creatures,
        itemsLayer,
        ambient,
        particles,
        rain,
        tint,
        hand,
      );
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
      ambientLayer = ambient;
      rainLayer = rain;
      puddleG = puddles;
      weatherTint = tint;
      worldLayer = root;
      sandLayer = sand;
      waterLayer = water;
      decorationLayer = decorations;
      resourceLayer = resources;
      shadowG = shadows;
      selectionG = selection;
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

      const sandTexture = makeSandTexture(seed);
      const waterScale = cellSize / 16;
      const sandScale = cellSize / 16;

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
            s.position.set(cx * cellSize, cy * cellSize);
            s.scale.set(sandScale);
            sandLayer.addChild(s);
          }
          if (water) {
            const s = new Sprite(waterFrames[0]);
            s.position.set(cx * cellSize, cy * cellSize);
            s.scale.set(waterScale);
            waterLayer.addChild(s);
            waterSprites.push(s);
          }
        }
      }
    },

    /** Desenha o cenário que o MUNDO possui (as árvores que dão frutas). */
    setScenery(pieces: readonly ScenerySpot[]): void {
      if (!decorationLayer || !scenery) return;
      decorationLayer.removeChildren();
      for (const piece of pieces) {
        const sprite = new Sprite(scenery[piece.kind]);
        sprite.anchor.set(0.5, 0.9);
        sprite.scale.set(PIXEL_SCALE);
        sprite.position.set(piece.x, piece.y);
        sprite.zIndex = piece.y;
        decorationLayer.addChild(sprite);
      }
    },

    onSelectedScreen(callback: (x: number, y: number, visible: boolean) => void): void {
      selectedScreenCb = callback;
    },

    setHandlers(next: GestureHandlers): void {
      gestures = new GestureRecognizer(next, {
        creatureAt: pickCreature,
        itemAt: pickItem,
      });
    },

    emit(kind: FeedbackKind, worldX: number, worldY: number): void {
      if (!particleLayer || !feedbackTextures || feedback.length > 40) return;
      const sprite = new Sprite(feedbackTextures[kind]);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(worldX, worldY);
      particleLayer.addChild(sprite);
      feedback.push({ sprite, life: 1.4, maxLife: 1.4 });
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
        fitZoom = Math.min(screenWidth / options.worldWidth, screenHeight / options.worldHeight);
        camera.zoom = fitZoom * 2.4;
        cameraReady = true;
      }

      if (input.followId !== null) {
        const buffer = input.creatures;
        for (let i = 0; i < buffer.count; i++) {
          if (buffer.id[i] === input.followId) {
            camera.x = lerp(buffer.prevX[i]!, buffer.x[i]!, input.alpha);
            camera.y = lerp(buffer.prevY[i]!, buffer.y[i]!, input.alpha);
            break;
          }
        }
      }

      worldLayer.scale.set(camera.zoom);
      worldLayer.position.set(
        screenWidth / 2 - camera.x * camera.zoom,
        screenHeight / 2 - camera.y * camera.zoom,
      );

      // Água animada.
      if (waterFrames.length > 0 && waterSprites.length > 0) {
        const frame = Math.floor((elapsed * 1000) / WATER_FRAME_MS) % waterFrames.length;
        const texture = waterFrames[frame]!;
        for (let i = 0; i < waterSprites.length; i++) waterSprites[i]!.texture = texture;
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
        sprite.position.set(
          px + (plants.x[i]! - px) * input.alpha,
          py + (plants.y[i]! - py) * input.alpha,
        );
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
        const dx = creatures.x[i]! - px;
        const dy = creatures.y[i]! - py;
        const moving = creatures.moving[i] === 1;
        const mood = creatures.mood[i]!;
        const stage = creatures.stage[i]! as LifeStage;
        const dna = creatures.dna[i]!;

        let slot = creatureSlots.get(id);
        if (!slot) {
          const container = new Container();
          const body = new Sprite();
          const face = new Sprite();
          body.anchor.set(0.5, 0.78);
          face.anchor.set(0.5, 0.78);
          container.addChild(body, face);
          creatureLayer.addChild(container);
          slot = {
            container,
            body,
            face,
            features: decodeFeatures(dna, creatures.species[i]!),
            facing: 1,
            seen: frameId,
            stage: -1,
            blinkIn: 1 + (id % 7) * 0.5,
            blinking: 0,
            yawnIn: 6 + (id % 5) * 3,
            yawning: 0,
          };
          creatureSlots.set(id, slot);
        }

        const speciesIndex = creatures.species[i]!;
        if (slot.stage !== stage) {
          slot.body.texture = getBodyTexture(
            dna,
            { body: creatures.bodyColor[i]!, accent: creatures.accentColor[i]! },
            stage,
            speciesIndex,
          );
          slot.stage = stage;
        }

        // Piscar aleatório — só quando os olhos estão abertos.
        const eyesOpen = mood !== MOOD.sleepy && mood !== MOOD.loved;
        slot.blinkIn -= dt;
        if (slot.blinking > 0) slot.blinking -= dt;
        else if (slot.blinkIn <= 0 && eyesOpen) {
          slot.blinking = BLINK_DURATION;
          // Sonolentas piscam devagar e com mais frequência.
          slot.blinkIn = (mood === MOOD.sleepy ? 1.2 : 2.5) + Math.random() * 4;
        }

        // Bocejo: sonolentas e idosas bocejam de vez em quando.
        const canYawn = mood === MOOD.sleepy || stage === 2;
        slot.yawnIn -= dt;
        if (slot.yawning > 0) slot.yawning -= dt;
        else if (slot.yawnIn <= 0 && canYawn) {
          slot.yawning = 0.9;
          slot.yawnIn = (stage === 2 ? 8 : 14) + Math.random() * 10;
        }

        const expression: Expression =
          slot.yawning > 0
            ? 'yawn'
            : slot.blinking > 0 && eyesOpen
              ? 'blink'
              : (EXPRESSIONS[mood] ?? 'neutral');
        // As texturas são cacheadas: buscar todo quadro é só um lookup em Map.
        const faceTexture = getFaceTexture(
          expression,
          creatures.eyeColor[i]!,
          stage,
          slot.features,
          speciesIndex,
        );
        if (slot.face.texture !== faceTexture) slot.face.texture = faceTexture;

        // O olhar acompanha o movimento; se parada e curiosa, olha para a mão.
        if (dx > 0.05) slot.facing = 1;
        else if (dx < -0.05) slot.facing = -1;
        else if (mood === MOOD.curious && handWorld.inside) {
          slot.facing = handWorld.x >= cx ? 1 : -1;
        }

        const scale = size / 13;
        const anim = animateBody(mood, elapsed, id, size, moving, stage);
        // Bocejo empurra o corpo um pouco para trás, como um espreguiçar.
        const yawnTilt = slot.yawning > 0 ? -0.12 : 0;

        slot.container.scale.set(slot.facing * scale * anim.squashX, scale * anim.squashY);
        slot.container.rotation = (anim.tilt + yawnTilt) * slot.facing;
        slot.container.position.set(cx + anim.jitter, cy - anim.bob + anim.yOffset);

        // O olhar segue a direção do movimento (deslocando o rosto 1 px).
        const gaze = Math.hypot(dx, dy) > 0.05 ? 1 : 0;
        slot.face.position.set(gaze * Math.sign(dx || 1) * slot.facing, gaze * Math.sign(dy) * 0.5);
        slot.seen = frameId;

        // Poeirinha dos passos.
        if (moving && dustTimer <= 0) {
          spawnDust(cx, cy + size * 0.42, size);
        }

        // Sombra suave.
        shadowG.ellipse(cx, cy + size * 0.42, size * 0.62, size * 0.26).fill({
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
            selX * camera.zoom + screenWidth / 2 - camera.x * camera.zoom,
            (selY - selSize * 2.4) * camera.zoom + screenHeight / 2 - camera.y * camera.zoom,
            true,
          );
        } else {
          selectedScreenCb(0, 0, false);
        }
      }

      // Anel de seleção animado.
      selectionG.clear();
      if (selFound) {
        const pulse = 1 + Math.sin(elapsed * 4) * 0.12;
        selectionG
          .ellipse(selX, selY, selSize * 1.5 * pulse, selSize * 0.7 * pulse)
          .stroke({ width: 1.5, color: SELECTION_COLOR, alpha: 0.9 });
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
          sprite.position.set(
            px + (items.x[i]! - px) * input.alpha,
            py + (items.y[i]! - py) * input.alpha,
          );
          sprite.scale.set(clamp(items.radius[i]! * 0.14, 0.4, 1.2));
          // Frutas passadas escurecem: dá para ver que estão apodrecendo.
          const freshness = items.color[i]! / 255;
          sprite.tint = freshness > 0.5 ? 0xffffff : 0xa89070;
          sprite.alpha = 0.5 + freshness * 0.5;
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
          handSprite.position.set(handWorld.x, handWorld.y + wobble / camera.zoom);
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

      // Bichinhos de ambiente: borboletas, abelhas, pássaros, bichinhos.
      if (ambientLayer && ambientTextures.length > 0) {
        for (let i = 0; i < input.ambient.length; i++) {
          const being = input.ambient[i]!;
          let sprite = ambientSprites[i];
          if (!sprite) {
            sprite = new Sprite();
            sprite.anchor.set(0.5);
            ambientLayer.addChild(sprite);
            ambientSprites[i] = sprite;
          }
          const frames = ambientTextures[being.kind] ?? ambientTextures[0]!;
          // Pousado = asas fechadas; voando = bate asas.
          const frame = being.resting > 0 ? 1 : Math.sin(being.phase) > 0 ? 0 : 1;
          sprite.texture = frames[frame]!;
          sprite.position.set(being.x, being.y - (being.resting > 0 ? 0 : 3));
          sprite.visible = true;
          // Na chuva os insetos somem de cena.
          sprite.alpha = being.kind <= 1 ? 1 - input.rain : 1;
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

        weatherTint.clear();
        if (input.rain > 0.01) {
          weatherTint
            .rect(0, 0, options.worldWidth, options.worldHeight)
            .fill({ color: 0x24344f, alpha: input.rain * 0.4 });
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
        leaf.sprite.position.set(drawX, leaf.y);
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
      clearCreatureTextureCache();
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
        rainLayer = null;
        puddleG = null;
        weatherTint = null;
      }
    },
  };
}
