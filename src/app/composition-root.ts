import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@ui';
import { createRenderer } from '@rendering';

export interface AppInstance {
  dispose(): void;
}

/**
 * Composition root: o ÚNICO lugar que conhece todas as camadas e as conecta.
 * Injeta no React uma função `mountCanvas` construída a partir do renderer,
 * de modo que a UI permaneça sem conhecimento de PixiJS.
 */
export function createApp(rootElement: HTMLElement): AppInstance {
  const mountCanvas = (container: HTMLElement): (() => void) => {
    const renderer = createRenderer();
    void renderer.mount(container);
    return () => renderer.destroy();
  };

  const root = createRoot(rootElement);
  root.render(createElement(StrictMode, null, createElement(App, { mountCanvas })));

  return {
    dispose(): void {
      root.unmount();
    },
  };
}
