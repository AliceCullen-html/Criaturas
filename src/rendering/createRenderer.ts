import { Application } from 'pixi.js';

/**
 * Adapter de renderização. No scaffold apenas cria e limpa uma `Application`
 * PixiJS; a partir da Etapa 1 passa a desenhar o snapshot da simulação.
 *
 * Cada chamada de `mount` cria uma instância própria, o que torna o componente
 * seguro contra o duplo-mount do React StrictMode em desenvolvimento.
 */
export interface Renderer {
  mount(container: HTMLElement): Promise<void>;
  destroy(): void;
}

const BACKGROUND_COLOR = 0x171922;

export function createRenderer(): Renderer {
  let app: Application | null = null;
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

      // Se `destroy` foi chamado enquanto o init assíncrono rodava, descarta.
      if (destroyed) {
        instance.destroy(true);
        return;
      }

      app = instance;
      container.appendChild(instance.canvas);
    },

    destroy(): void {
      destroyed = true;
      if (app) {
        app.destroy(true, { children: true });
        app = null;
      }
    },
  };
}
