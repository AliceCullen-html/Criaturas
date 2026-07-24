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

export interface RendererOptions {
  worldWidth: number;
  worldHeight: number;
}

export interface FrameInput {
  plants: RenderBuffer;
  creatures: CreatureRenderBuffer;
  alpha: number;
  selectedId: number | null;
  followId: number | null;
}

export interface RendererHandlers {
  onSelect: (id: number | null) => void;
  onCancelFollow: () => void;
  /** Posição do cursor no mundo — é a "presença" do jogador que as criaturas sentem. */
  onPointerWorld: (x: number, y: number, inside: boolean) => void;
}

export interface Renderer {
  mount(container: HTMLElement): Promise<void>;
  setTerrain(grid: TileGrid, waterValue: number, seed: number): void;
  setHandlers(handlers: RendererHandlers): void;
  frame(input: FrameInput): void;
  destroy(): void;
}

const BACKGROUND_COLOR = 0x2b4a3a;
const SELECTION_COLOR = 0x9be0b4;
const SHADOW_COLOR = 0x101408;
const DRAG_THRESHOLD = 5;
const PIXEL_SCALE = 0.8;
const DECORATION_COUNT = 70;
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
];

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
}

interface Dust {
  sprite: Sprite;
  life: number;
  vx: number;
  vy: number;
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
  let dustTexture: Texture | null = null;
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

  let handlers: RendererHandlers | null = null;
  let lastCreatures: CreatureRenderBuffer | null = null;

  let pointerDown = false;
  let dragging = false;
  let startClientX = 0;
  let startClientY = 0;
  let downCamX = 0;
  let downCamY = 0;

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
      const reach = Math.max(buffer.size[i]! * 1.8, 16);
      if (dist <= reach * reach && dist < bestDist) {
        bestDist = dist;
        best = buffer.id[i]!;
      }
    }
    return best;
  }

  function attachInput(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (event) => {
      pointerDown = true;
      dragging = false;
      startClientX = event.clientX;
      startClientY = event.clientY;
      downCamX = camera.x;
      downCamY = camera.y;
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointerleave', () => handlers?.onPointerWorld(0, 0, false));

    canvas.addEventListener('pointermove', (event) => {
      if (app) {
        const rect = canvas.getBoundingClientRect();
        handlers?.onPointerWorld(
          screenToWorldX(event.clientX - rect.left, app.screen.width),
          screenToWorldY(event.clientY - rect.top, app.screen.height),
          true,
        );
      }
      if (!pointerDown) return;
      const dx = event.clientX - startClientX;
      const dy = event.clientY - startClientY;
      if (!dragging && dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
        dragging = true;
        handlers?.onCancelFollow();
      }
      if (dragging) {
        camera.x = downCamX - dx / camera.zoom;
        camera.y = downCamY - dy / camera.zoom;
      }
    });

    const endPointer = (event: PointerEvent): void => {
      if (!pointerDown) return;
      pointerDown = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (dragging || !app) return;
      const rect = canvas.getBoundingClientRect();
      const worldX = screenToWorldX(event.clientX - rect.left, app.screen.width);
      const worldY = screenToWorldY(event.clientY - rect.top, app.screen.height);
      handlers?.onSelect(pickCreature(worldX, worldY));
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

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
      const shadows = new Graphics();
      const selection = new Graphics();
      const creatures = new Container();
      const particles = new Container();
      root.addChild(
        grassTile,
        sand,
        water,
        decorations,
        resources,
        shadows,
        selection,
        creatures,
        particles,
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

      // Cenário decorativo em solo.
      const rng = createRng(seed ^ 0x9e3779b1);
      const kinds: Array<keyof SceneryTextures> = ['tree', 'tree', 'rock', 'bush'];
      for (let i = 0; i < DECORATION_COUNT; i++) {
        const cx = rng.int(cols);
        const cy = rng.int(rows);
        if (
          isWater(cx, cy) ||
          isWater(cx - 1, cy) ||
          isWater(cx + 1, cy) ||
          isWater(cx, cy - 1) ||
          isWater(cx, cy + 1)
        ) {
          continue;
        }
        const kind = kinds[rng.int(kinds.length)]!;
        const sprite = new Sprite(scenery[kind]);
        sprite.anchor.set(0.5, 0.9);
        sprite.scale.set(PIXEL_SCALE);
        const x = (cx + rng.next()) * cellSize;
        const y = (cy + rng.next()) * cellSize;
        sprite.position.set(x, y);
        sprite.zIndex = y;
        decorationLayer.addChild(sprite);
      }
    },

    setHandlers(next: RendererHandlers): void {
      handlers = next;
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

      const now = performance.now();
      const dt = lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      elapsed += dt;

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
            features: decodeFeatures(dna),
            facing: 1,
            seen: frameId,
            stage: -1,
            blinkIn: 1 + (id % 7) * 0.5,
            blinking: 0,
          };
          creatureSlots.set(id, slot);
        }

        if (slot.stage !== stage) {
          slot.body.texture = getBodyTexture(dna, creatures.bodyColor[i]!, stage);
          slot.stage = stage;
        }

        // Piscar aleatório — só quando os olhos estão abertos.
        const eyesOpen = mood !== 3 && mood !== 7;
        slot.blinkIn -= dt;
        if (slot.blinking > 0) slot.blinking -= dt;
        else if (slot.blinkIn <= 0 && eyesOpen) {
          slot.blinking = BLINK_DURATION;
          slot.blinkIn = 2.5 + Math.random() * 4;
        }

        const expression: Expression =
          slot.blinking > 0 && eyesOpen ? 'blink' : (EXPRESSIONS[mood] ?? 'neutral');
        // As texturas são cacheadas: buscar todo quadro é só um lookup em Map.
        const faceTexture = getFaceTexture(
          expression,
          creatures.eyeColor[i]!,
          stage,
          slot.features,
        );
        if (slot.face.texture !== faceTexture) slot.face.texture = faceTexture;

        if (dx > 0.05) slot.facing = 1;
        else if (dx < -0.05) slot.facing = -1;

        const scale = size / 13;
        // Respiração constante (1–2 px) + reações por emoção.
        let squash = 1 + Math.sin(elapsed * 2.4 + id) * 0.035;
        let bob = 0;
        let jitter = 0;
        let tilt = 0;

        if (moving) {
          // Balanço curto ao andar; filhotes dão passinhos mais rápidos.
          const cadence = stage === 0 ? 13 : stage === 2 ? 6 : 9;
          bob = Math.abs(Math.sin(elapsed * cadence + id)) * size * 0.1;
          tilt = Math.sin(elapsed * cadence + id) * 0.06;
        }
        if (mood === 1 || mood === 7) {
          bob += Math.abs(Math.sin(elapsed * 6 + id)) * size * 0.2; // pulinhos de alegria
        } else if (mood === 8) {
          jitter = Math.sin(elapsed * 34 + id) * size * 0.07; // tremendo de medo
        } else if (mood === 6 || mood === 2) {
          bob *= 0.3; // triste/carente: arrasta-se
        } else if (mood === 3) {
          squash = 1 + Math.sin(elapsed * 1.6 + id) * 0.06; // respirando devagar
          bob = 0;
        } else if (mood === 4) {
          bob += size * 0.12; // sobressalto
        }

        slot.container.scale.set(slot.facing * scale, scale * squash);
        slot.container.rotation = tilt * slot.facing;
        slot.container.position.set(cx + jitter, cy - bob);
        // O olhar acompanha a direção do movimento.
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

      // Anel de seleção animado.
      selectionG.clear();
      if (selFound) {
        const pulse = 1 + Math.sin(elapsed * 4) * 0.12;
        selectionG
          .ellipse(selX, selY, selSize * 1.5 * pulse, selSize * 0.7 * pulse)
          .stroke({ width: 1.5, color: SELECTION_COLOR, alpha: 0.9 });
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
      }
    },
  };
}
