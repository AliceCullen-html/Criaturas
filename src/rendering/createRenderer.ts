import { Application, Container, Graphics } from 'pixi.js';
import type { RenderBuffer } from '@engine';

export interface RendererOptions {
  worldWidth: number;
  worldHeight: number;
}

/**
 * Adapter de renderização (somente leitura). Desenha o `RenderBuffer` da
 * simulação, interpolando entre o passo anterior e o atual para movimento
 * suave a 60fps mesmo com a lógica rodando a 20 Hz.
 *
 * Cada `mount` cria uma instância própria — seguro contra o duplo-mount do
 * React StrictMode em desenvolvimento.
 */
export interface Renderer {
  mount(container: HTMLElement): Promise<void>;
  render(buffer: RenderBuffer, alpha: number): void;
  destroy(): void;
}

const BACKGROUND_COLOR = 0x171922;
const BORDER_COLOR = 0x2a2f42;

export function createRenderer(options: RendererOptions): Renderer {
  let app: Application | null = null;
  let stage: Container | null = null;
  let entities: Graphics | null = null;
  let destroyed = false;

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

      const worldLayer = new Container();
      const border = new Graphics()
        .rect(0, 0, options.worldWidth, options.worldHeight)
        .stroke({ width: 2, color: BORDER_COLOR });
      const entityLayer = new Graphics();
      worldLayer.addChild(border);
      worldLayer.addChild(entityLayer);
      instance.stage.addChild(worldLayer);

      app = instance;
      stage = worldLayer;
      entities = entityLayer;
      container.appendChild(instance.canvas);
    },

    render(buffer: RenderBuffer, alpha: number): void {
      if (!app || !stage || !entities) return;

      // Câmera de ajuste: escala uniforme para caber o mundo, centralizado.
      const screenWidth = app.screen.width;
      const screenHeight = app.screen.height;
      const scale = Math.min(screenWidth / options.worldWidth, screenHeight / options.worldHeight);
      stage.scale.set(scale);
      stage.position.set(
        (screenWidth - options.worldWidth * scale) / 2,
        (screenHeight - options.worldHeight * scale) / 2,
      );

      const graphics = entities;
      graphics.clear();
      for (let i = 0; i < buffer.count; i++) {
        const px = buffer.prevX[i]!;
        const py = buffer.prevY[i]!;
        const x = px + (buffer.x[i]! - px) * alpha;
        const y = py + (buffer.y[i]! - py) * alpha;
        graphics.circle(x, y, buffer.radius[i]!).fill(buffer.color[i]!);
      }
    },

    destroy(): void {
      destroyed = true;
      if (app) {
        app.destroy(true, { children: true });
        app = null;
        stage = null;
        entities = null;
      }
    },
  };
}
