import { Application, Container, Graphics } from 'pixi.js';
import { clamp, lerp } from '@core';
import type { CreatureRenderBuffer, RenderBuffer, TileGrid } from '@engine';
import { CreatureView } from './CreatureView';

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
}

export interface Renderer {
  mount(container: HTMLElement): Promise<void>;
  setTiles(grid: TileGrid, colors: readonly number[]): void;
  setHandlers(handlers: RendererHandlers): void;
  frame(input: FrameInput): void;
  destroy(): void;
}

const BACKGROUND_COLOR = 0x171922;
const BORDER_COLOR = 0x2a2f42;
const SELECTION_COLOR = 0x86c8a8;
const DRAG_THRESHOLD = 5;

export function createRenderer(options: RendererOptions): Renderer {
  let app: Application | null = null;
  let worldLayer: Container | null = null;
  let tilesG: Graphics | null = null;
  let plantsG: Graphics | null = null;
  let selectionG: Graphics | null = null;
  let creaturesLayer: Container | null = null;
  let destroyed = false;

  const camera = { x: options.worldWidth / 2, y: options.worldHeight / 2, zoom: 1 };
  let fitZoom = 1;
  let cameraReady = false;

  const views = new Map<number, CreatureView>();
  const pool: CreatureView[] = [];
  let frameId = 0;
  let lastTime = 0;

  let handlers: RendererHandlers | null = null;
  let lastCreatures: CreatureRenderBuffer | null = null;

  // Estado do ponteiro (pan/seleção).
  let pointerDown = false;
  let dragging = false;
  let startClientX = 0;
  let startClientY = 0;
  let downCamX = 0;
  let downCamY = 0;

  function screenToWorldX(screenX: number, screenWidth: number): number {
    return (screenX - screenWidth / 2) / camera.zoom + camera.x;
  }
  function screenToWorldY(screenY: number, screenHeight: number): number {
    return (screenY - screenHeight / 2) / camera.zoom + camera.y;
  }

  function pickCreature(worldX: number, worldY: number): number | null {
    const buffer = lastCreatures;
    if (!buffer) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < buffer.count; i++) {
      const dx = buffer.x[i]! - worldX;
      const dy = buffer.y[i]! - worldY;
      const dist = dx * dx + dy * dy;
      const reach = Math.max(buffer.size[i]! * 1.5, 14);
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

    canvas.addEventListener('pointermove', (event) => {
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
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
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
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldX = screenToWorldX(screenX, app.screen.width);
        const worldY = screenToWorldY(screenY, app.screen.height);
        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        camera.zoom = clamp(camera.zoom * factor, fitZoom * 0.6, fitZoom * 6);
        camera.x = worldX - (screenX - app.screen.width / 2) / camera.zoom;
        camera.y = worldY - (screenY - app.screen.height / 2) / camera.zoom;
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
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });
      if (destroyed) {
        instance.destroy(true);
        return;
      }

      const root = new Container();
      const tiles = new Graphics();
      const border = new Graphics()
        .rect(0, 0, options.worldWidth, options.worldHeight)
        .stroke({ width: 2, color: BORDER_COLOR });
      const plants = new Graphics();
      const selection = new Graphics();
      const creatures = new Container();
      root.addChild(tiles, border, plants, selection, creatures);
      instance.stage.addChild(root);

      app = instance;
      worldLayer = root;
      tilesG = tiles;
      plantsG = plants;
      selectionG = selection;
      creaturesLayer = creatures;

      container.appendChild(instance.canvas);
      attachInput(instance.canvas);
    },

    setTiles(grid: TileGrid, colors: readonly number[]): void {
      if (!tilesG) return;
      const graphics = tilesG;
      graphics.clear();
      const { cols, rows, cellSize, cells } = grid;
      for (let cellY = 0; cellY < rows; cellY++) {
        for (let cellX = 0; cellX < cols; cellX++) {
          const value = cells[cellY * cols + cellX]!;
          if (value === 0) continue;
          const color = colors[value];
          if (color === undefined) continue;
          graphics.rect(cellX * cellSize, cellY * cellSize, cellSize, cellSize).fill(color);
        }
      }
    },

    setHandlers(next: RendererHandlers): void {
      handlers = next;
    },

    frame(input: FrameInput): void {
      if (!app || !worldLayer || !plantsG || !selectionG || !creaturesLayer) return;
      lastCreatures = input.creatures;

      const now = performance.now();
      const dt = lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const screenWidth = app.screen.width;
      const screenHeight = app.screen.height;

      if (!cameraReady) {
        fitZoom = Math.min(screenWidth / options.worldWidth, screenHeight / options.worldHeight);
        camera.zoom = fitZoom;
        cameraReady = true;
      }

      // Seguir a criatura selecionada.
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

      // Plantas em batch.
      const plants = input.plants;
      plantsG.clear();
      for (let i = 0; i < plants.count; i++) {
        const px = plants.prevX[i]!;
        const py = plants.prevY[i]!;
        const x = px + (plants.x[i]! - px) * input.alpha;
        const y = py + (plants.y[i]! - py) * input.alpha;
        plantsG.circle(x, y, plants.radius[i]!).fill(plants.color[i]!);
      }

      // Criaturas: uma view por criatura, com pool.
      frameId += 1;
      const creatures = input.creatures;
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

        let view = views.get(id);
        if (!view) {
          view = pool.pop() ?? new CreatureView();
          views.set(id, view);
          creaturesLayer.addChild(view.container);
        }
        view.seenFrame = frameId;
        view.container.position.set(cx, cy);
        view.update(
          dt,
          creatures.size[i]!,
          creatures.bodyColor[i]!,
          creatures.eyeColor[i]!,
          creatures.x[i]! - px,
          creatures.y[i]! - py,
        );

        if (id === input.selectedId) {
          selX = cx;
          selY = cy;
          selSize = creatures.size[i]!;
          selFound = true;
        }
      }

      // Recicla views de criaturas que sumiram (morte/despawn).
      for (const [id, view] of views) {
        if (view.seenFrame !== frameId) {
          creaturesLayer.removeChild(view.container);
          views.delete(id);
          pool.push(view);
        }
      }

      // Anel de seleção.
      selectionG.clear();
      if (selFound) {
        selectionG
          .circle(selX, selY, selSize * 1.6)
          .stroke({ width: 2, color: SELECTION_COLOR, alpha: 0.9 });
      }
    },

    destroy(): void {
      destroyed = true;
      views.clear();
      pool.length = 0;
      if (app) {
        app.destroy(true, { children: true });
        app = null;
        worldLayer = null;
        tilesG = null;
        plantsG = null;
        selectionG = null;
        creaturesLayer = null;
      }
    },
  };
}
