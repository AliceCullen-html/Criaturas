import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { RenderBuffer, SimulationLoop, SystemScheduler } from '@engine';
import { createDemoWorld, movementSystem, syncRenderBuffer } from '@simulation';
import { createRenderer, type Renderer } from '@rendering';
import { App } from '@ui';
import { useUiStore } from '@ui/store/simulationStore';

export interface AppInstance {
  dispose(): void;
}

const WORLD_CONFIG = { width: 1000, height: 1000 } as const;
const DEMO_SEED = 1337;
const FIXED_DT = 1 / 20; // 20 Hz lógicos
const BUFFER_CAPACITY = 1024;
const STATS_INTERVAL_FRAMES = 12; // ~5 atualizações de HUD por segundo

/**
 * Composition root: o ÚNICO lugar que conhece todas as camadas e as conecta.
 * Cria o mundo/loop/render, liga os controles da HUD (Zustand) ao loop e
 * devolve estatísticas agregadas para a UI — sem que a simulação conheça React.
 */
export function createApp(rootElement: HTMLElement): AppInstance {
  const world = createDemoWorld(WORLD_CONFIG, DEMO_SEED);
  const scheduler = new SystemScheduler().add(movementSystem);
  const renderBuffer = new RenderBuffer(BUFFER_CAPACITY);

  let activeRenderer: Renderer | null = null;
  let frameCounter = 0;

  const step = (dt: number): void => {
    scheduler.update(world, dt);
    world.tick += 1;
  };

  const render = (alpha: number): void => {
    syncRenderBuffer(world, renderBuffer);
    activeRenderer?.render(renderBuffer, alpha);

    frameCounter += 1;
    if (frameCounter >= STATS_INTERVAL_FRAMES) {
      frameCounter = 0;
      useUiStore.getState().setStats({ tick: world.tick, population: world.entities.count });
    }
  };

  const loop = new SimulationLoop(
    FIXED_DT,
    { step, render },
    {
      getSpeed: () => {
        const state = useUiStore.getState();
        return state.isRunning ? state.speed : 0;
      },
    },
  );

  const mountCanvas = (container: HTMLElement): (() => void) => {
    const renderer = createRenderer({
      worldWidth: WORLD_CONFIG.width,
      worldHeight: WORLD_CONFIG.height,
    });
    let cancelled = false;

    void renderer.mount(container).then(() => {
      if (!cancelled) activeRenderer = renderer;
    });

    if (!loop.isRunning) loop.start();

    return () => {
      cancelled = true;
      if (activeRenderer === renderer) activeRenderer = null;
      renderer.destroy();
    };
  };

  const root = createRoot(rootElement);
  root.render(createElement(StrictMode, null, createElement(App, { mountCanvas })));

  return {
    dispose(): void {
      loop.stop();
      root.unmount();
    },
  };
}
