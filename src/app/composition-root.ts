import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { RenderBuffer, SimulationLoop, SystemScheduler, writeRenderBuffer } from '@engine';
import { createWorld, plantGrowthSystem, plantSpreadSystem, TerrainResource, WATER } from '@world';
import { createRenderer, type Renderer } from '@rendering';
import { App } from '@ui';
import { useUiStore } from '@ui/store/simulationStore';

export interface AppInstance {
  dispose(): void;
}

const WORLD_CONFIG = { width: 1000, height: 1000 } as const;
const WORLD_SEED = 1337;
const FIXED_DT = 1 / 20; // 20 Hz lógicos
const BUFFER_CAPACITY = 1024;
const STATS_INTERVAL_FRAMES = 12; // ~5 atualizações de HUD por segundo

// Cor por valor de célula do terreno (índice = valor da célula).
const TILE_COLORS: number[] = [];
TILE_COLORS[WATER] = 0x2c4a63;

/**
 * Composition root: o ÚNICO lugar que conhece todas as camadas e as conecta.
 * Cria mundo/loop/render, liga os controles da HUD (Zustand) ao loop e devolve
 * estatísticas agregadas para a UI — sem que a simulação conheça React.
 */
export function createApp(rootElement: HTMLElement): AppInstance {
  const world = createWorld(WORLD_CONFIG, WORLD_SEED);
  const terrain = world.getResource(TerrainResource);
  const scheduler = new SystemScheduler().add(plantGrowthSystem).add(plantSpreadSystem);
  const renderBuffer = new RenderBuffer(BUFFER_CAPACITY);

  let activeRenderer: Renderer | null = null;
  let frameCounter = 0;

  const step = (dt: number): void => {
    scheduler.update(world, dt);
    world.tick += 1;
  };

  const render = (alpha: number): void => {
    writeRenderBuffer(world, renderBuffer);
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
      if (cancelled) return;
      renderer.setTiles(terrain, TILE_COLORS);
      activeRenderer = renderer;
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
