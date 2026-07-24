import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CreatureRenderBuffer,
  RenderBuffer,
  SimulationLoop,
  SystemScheduler,
  writeRenderBuffer,
} from '@engine';
import {
  createWorld,
  plantGrowthSystem,
  plantSpreadSystem,
  Plant,
  TerrainResource,
  WATER,
} from '@world';
import { Creature } from '@creatures';
import {
  eatingSystem,
  feedCreature,
  foodIndexSystem,
  instinctSystem,
  metabolismSystem,
  movementSystem,
  readCreatureSnapshot,
  setCreatureName,
  spawnCreatures,
  writeCreatureBuffer,
} from '@simulation';
import { createRenderer, type Renderer } from '@rendering';
import { App, type GameActions } from '@ui';
import { useUiStore } from '@ui/store/simulationStore';

export interface AppInstance {
  dispose(): void;
}

const WORLD_CONFIG = { width: 1000, height: 1000 } as const;
const WORLD_SEED = 1337;
const INITIAL_CREATURES = 12;
const FIXED_DT = 1 / 20;
const PLANT_CAPACITY = 512;
const CREATURE_CAPACITY = 128;
const STATS_INTERVAL_FRAMES = 12;

export function createApp(rootElement: HTMLElement): AppInstance {
  const world = createWorld(WORLD_CONFIG, WORLD_SEED);
  spawnCreatures(world, INITIAL_CREATURES);
  const terrain = world.getResource(TerrainResource);

  const scheduler = new SystemScheduler()
    .add(foodIndexSystem)
    .add(instinctSystem)
    .add(movementSystem)
    .add(eatingSystem)
    .add(metabolismSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);

  const plantBuffer = new RenderBuffer(PLANT_CAPACITY);
  const creatureBuffer = new CreatureRenderBuffer(CREATURE_CAPACITY);

  let activeRenderer: Renderer | null = null;
  let frameCounter = 0;

  const store = useUiStore;

  const pushSelected = (): void => {
    const id = store.getState().selectedId;
    if (id === null) return;
    const snapshot = readCreatureSnapshot(world, id);
    if (!snapshot) {
      // Criatura morreu/sumiu — limpa a seleção.
      store.getState().setSelectedId(null);
      store.getState().setFollowId(null);
      store.getState().setSelected(null);
      return;
    }
    store.getState().setSelected(snapshot);
  };

  const step = (dt: number): void => {
    scheduler.update(world, dt);
    world.tick += 1;
  };

  const render = (alpha: number): void => {
    writeRenderBuffer(world, plantBuffer);
    writeCreatureBuffer(world, creatureBuffer);
    const state = store.getState();
    activeRenderer?.frame({
      plants: plantBuffer,
      creatures: creatureBuffer,
      alpha,
      selectedId: state.selectedId,
      followId: state.followId,
    });

    frameCounter += 1;
    if (frameCounter >= STATS_INTERVAL_FRAMES) {
      frameCounter = 0;
      store.getState().setStats({
        tick: world.tick,
        population: world.store(Creature).size,
        plants: world.store(Plant).size,
      });
      pushSelected();
    }
  };

  const loop = new SimulationLoop(
    FIXED_DT,
    { step, render },
    {
      getSpeed: () => {
        const state = store.getState();
        return state.isRunning ? state.speed : 0;
      },
    },
  );

  const actions: GameActions = {
    feed: () => {
      const id = store.getState().selectedId;
      if (id !== null) {
        feedCreature(world, id);
        pushSelected();
      }
    },
    rename: (name: string) => {
      const id = store.getState().selectedId;
      if (id !== null) {
        setCreatureName(world, id, name);
        pushSelected();
      }
    },
    toggleFollow: () => {
      const state = store.getState();
      state.setFollowId(state.followId !== null ? null : state.selectedId);
    },
    deselect: () => {
      store.getState().setSelectedId(null);
      store.getState().setFollowId(null);
      store.getState().setSelected(null);
    },
  };

  const mountCanvas = (container: HTMLElement): (() => void) => {
    const renderer = createRenderer({
      worldWidth: WORLD_CONFIG.width,
      worldHeight: WORLD_CONFIG.height,
    });
    let cancelled = false;

    renderer.setHandlers({
      onSelect: (id) => {
        store.getState().setSelectedId(id);
        if (id === null) {
          store.getState().setFollowId(null);
          store.getState().setSelected(null);
        } else {
          pushSelected();
        }
      },
      onCancelFollow: () => store.getState().setFollowId(null),
    });

    void renderer.mount(container).then(() => {
      if (cancelled) return;
      renderer.setTerrain(terrain, WATER, WORLD_SEED);
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
  root.render(createElement(StrictMode, null, createElement(App, { mountCanvas, actions })));

  return {
    dispose(): void {
      loop.stop();
      root.unmount();
    },
  };
}
