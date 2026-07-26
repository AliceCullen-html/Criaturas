import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CreatureRenderBuffer,
  RenderBuffer,
  SimulationLoop,
  SystemScheduler,
  Transform,
  writeRenderBuffer,
} from '@engine';
import { createUtilityBrain } from '@ai';
import {
  AmbientResource,
  ambientSystem,
  createWorld,
  Item,
  itemSystem,
  plantGrowthSystem,
  plantSpreadSystem,
  Plant,
  SceneryResource,
  TerrainResource,
  WATER,
  PropsResource,
  propSystem,
  WeatherResource,
  weatherSystem,
  DayNightResource,
  dayNightSystem,
  Item as ItemComponent,
} from '@world';
import { Creature, Emotions, Mind } from '@creatures';
import {
  actionSystem,
  BrainResource,
  callAttention,
  creatureIndexSystem,
  decisionSystem,
  emotionSystem,
  foodIndexSystem,
  grabItem,
  handReactionSystem,
  metabolismSystem,
  moveHeldItem,
  movementSystem,
  observeCreature,
  offerItem,
  petCreature,
  PlayerResource,
  readCreatureSnapshot,
  releaseItem,
  rememberPetting,
  reproductionSystem,
  roughGesture,
  attractBirds,
  searchSystem,
  idleSystem,
  DiscoveryResource,
  pokeProps,
  rememberPleasantPlace,
  setHandPresence,
  shakeTree,
  spawnCreatures,
  touchWater,
  turnRock,
  writeCreatureBuffer,
  writeItemBuffer,
} from '@simulation';
import { createRenderer, type FeedbackKind, type Renderer } from '@rendering';
import { App } from '@ui';
import { cardAnchor } from '@ui/cardAnchor';
import { useUiStore } from '@ui/store/simulationStore';

export interface AppInstance {
  dispose(): void;
}

const WORLD_CONFIG = { width: 600, height: 600 } as const;
const WORLD_SEED = 1337;
const INITIAL_CREATURES = 18;
const FIXED_DT = 1 / 20;
const PLANT_CAPACITY = 512;
const ITEM_CAPACITY = 256;
const CREATURE_CAPACITY = 128;
const STATS_INTERVAL_FRAMES = 10;

export function createApp(rootElement: HTMLElement): AppInstance {
  const world = createWorld(WORLD_CONFIG, WORLD_SEED);
  spawnCreatures(world, INITIAL_CREATURES);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  const terrain = world.getResource(TerrainResource);
  const scenery = world.getResource(SceneryResource);
  const ambient = world.getResource(AmbientResource);
  const weather = world.getResource(WeatherResource);
  const props = world.getResource(PropsResource);
  const cycle = world.getResource(DayNightResource);

  const scheduler = new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(emotionSystem)
    .add(handReactionSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(reproductionSystem)
    .add(metabolismSystem)
    .add(itemSystem)
    .add(searchSystem)
    .add(weatherSystem)
    .add(dayNightSystem)
    .add(ambientSystem)
    .add(propSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);

  const plantBuffer = new RenderBuffer(PLANT_CAPACITY);
  const itemBuffer = new RenderBuffer(ITEM_CAPACITY);
  const itemIds = new Int32Array(ITEM_CAPACITY);
  const creatureBuffer = new CreatureRenderBuffer(CREATURE_CAPACITY);

  let activeRenderer: Renderer | null = null;
  let frameCounter = 0;
  let cardTimer = 0;
  const store = useUiStore;
  const CARD_SECONDS = 7;

  /** Sinal visual sobre uma criatura (coração, gota, estrela). */
  const signal = (kind: FeedbackKind, id: number): void => {
    const transform = world.store(Transform).get(id);
    if (transform) activeRenderer?.emit(kind, transform.x, transform.y - 18);
  };

  const clearSelection = (): void => {
    store.getState().setSelectedId(null);
    store.getState().setSelected(null);
  };

  const pushSelected = (): void => {
    const id = store.getState().selectedId;
    if (id === null) return;
    const snapshot = readCreatureSnapshot(world, id);
    if (!snapshot) {
      clearSelection();
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
    writeItemBuffer(world, itemBuffer);
    writeCreatureBuffer(world, creatureBuffer);

    // Ids dos itens na mesma ordem do buffer, para o hit-test da mão.
    let index = 0;
    world.store(Item).forEach((_item, entity) => {
      if (index < ITEM_CAPACITY) itemIds[index++] = entity;
    });

    const state = store.getState();
    activeRenderer?.frame({
      plants: plantBuffer,
      items: itemBuffer,
      itemIds,
      creatures: creatureBuffer,
      alpha,
      selectedId: state.selectedId,
      followId: state.followId,
      ambient,
      rain: weather.intensity,
      puddles: weather.puddles,
      rainbow: weather.rainbow,
      darkness: cycle.darkness,
    });

    // Alguém achou o que estava escondido: uma estrela marca o lugar.
    if (world.hasResource(DiscoveryResource)) {
      const found = world.getResource(DiscoveryResource);
      for (const spot of found) activeRenderer?.emit('star', spot.x, spot.y - 10);
      found.length = 0;
    }

    // O cartão some sozinho depois de alguns segundos.
    if (state.selectedId !== null) {
      cardTimer -= 1 / 60;
      if (cardTimer <= 0) clearSelection();
    }

    frameCounter += 1;
    if (frameCounter >= STATS_INTERVAL_FRAMES) {
      frameCounter = 0;
      store.getState().setStats({
        tick: world.tick,
        population: world.store(Creature).size,
        plants: world.store(Plant).size,
        items: world.store(Item).size,
      });
      pushSelected();
      emitAmbientSignals();
    }
  };

  /** Balões espontâneos: o mundo se explica sem texto. */
  let ambientCursor = 0;
  const emitAmbientSignals = (): void => {
    const creatures = world.store(Creature);
    if (creatures.size === 0) return;
    const minds = world.store(Mind);
    const emotions = world.store(Emotions);
    let i = 0;
    let picked = -1;
    creatures.forEach((_tag, entity) => {
      if (i++ === ambientCursor % creatures.size) picked = entity;
    });
    ambientCursor += 1;
    if (picked < 0) return;

    const mind = minds.get(picked);
    const feel = emotions.get(picked);
    if (!mind || !feel) return;

    if (mind.intent === 'seekWater') signal('drop', picked);
    else if (mind.intent === 'sleep') signal('sleep', picked);
    else if (mind.affection > 0) signal('heart', picked);
    else if (feel.anger > 0.5) signal('anger', picked);
    else if (mind.attention > 0) signal('question', picked);
    else if (feel.happiness > 0.75) signal('heart', picked);
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

  const mountCanvas = (container: HTMLElement): (() => void) => {
    const renderer = createRenderer({
      worldWidth: WORLD_CONFIG.width,
      worldHeight: WORLD_CONFIG.height,
    });
    let cancelled = false;

    // Os gestos da mão viram ações no mundo. Nenhum botão envolvido.
    renderer.onSelectedScreen((x, y, visible) => {
      cardAnchor.x = x;
      cardAnchor.y = y;
      cardAnchor.visible = visible;
    });

    renderer.setHandlers({
      onSelect: (id) => {
        if (id === null) {
          clearSelection();
          return;
        }
        store.getState().setSelectedId(id);
        cardTimer = CARD_SECONDS;
        pushSelected();
      },
      onGrab: (itemId) => grabItem(world, itemId),
      onDragHeld: (itemId, x, y) => moveHeldItem(world, itemId, x, y),
      onRelease: (itemId, x, y, vx, vy) => {
        // Sementes largadas no chão chamam os pássaros.
        if (world.store(ItemComponent).get(itemId)?.kind === 'seed') attractBirds(world, x, y);
        const drop = releaseItem(world, itemId, vx, vy);
        // Arrumar uma pilha ou esconder algo tem retorno visual imediato: é
        // assim que o jogador descobre que pode fazer isso.
        if (drop.stacked > 0) activeRenderer?.emit('star', x, y - 12);
        else if (drop.hidden) activeRenderer?.emit('question', x, y - 12);
        // Enfeitar um canto torna o lugar agradável: quem estava por perto
        // passa a lembrar bem dali e volta com mais frequência.
        rememberPleasantPlace(world, x, y, 120);
      },
      onPet: (creatureId, dt) => {
        if (petCreature(world, creatureId, dt) === 'accepted') {
          if (Math.random() < dt * 1.5) signal('heart', creatureId);
        }
      },
      onPetRemembered: (creatureId) => {
        rememberPetting(world, creatureId);
        signal('star', creatureId);
        pushSelected();
      },
      onRough: (creatureId, speed, dirX, dirY) => {
        roughGesture(world, creatureId, speed, dirX, dirY);
        signal('anger', creatureId);
        pushSelected();
      },
      onCall: (creatureId) => {
        callAttention(world, creatureId);
        signal('question', creatureId);
      },
      onObserve: (creatureId) => observeCreature(world, creatureId),
      onOffer: (itemId, creatureId) => {
        if (offerItem(world, itemId, creatureId)) {
          signal('heart', creatureId);
          pushSelected();
        }
      },
      onHandMove: (x, y, inside) => setHandPresence(world, x, y, inside),

      // Mexer no cenário tem consequência: cai fruta, insetos voam, e as
      // criaturas curiosas vêm ver o que aconteceu.
      onPokeScenery: (kind, index) => {
        if (kind === 'tree') {
          const spot = shakeTree(world, index);
          if (spot.kind !== 'none') {
            activeRenderer?.shakeTreeAt(index);
            activeRenderer?.emit('star', spot.x, spot.y - 30);
          }
        } else if (kind === 'rock') {
          const spot = turnRock(world, index);
          if (spot.kind !== 'none') activeRenderer?.emit('question', spot.x, spot.y - 14);
        } else {
          pokeProps(world, 0, 0);
        }
      },
      onPokeGround: (x, y) => pokeProps(world, x, y),
      onPokeWater: (x, y) => {
        touchWater(world, x, y);
        activeRenderer?.ripple(x, y);
      },
    });

    void renderer.mount(container).then(() => {
      if (cancelled) return;
      renderer.setTerrain(terrain, WATER, WORLD_SEED);
      renderer.setScenery(scenery);
      renderer.setProps(props);
      activeRenderer = renderer;
    });

    if (!loop.isRunning) loop.start();

    return () => {
      cancelled = true;
      if (activeRenderer === renderer) activeRenderer = null;
      renderer.destroy();
    };
  };

  // Controles invisíveis: existem para quem procurar, sem ocupar a tela.
  // Espaço pausa, 1/2/4 mudam a velocidade.
  const onKeyDown = (event: KeyboardEvent): void => {
    const state = store.getState();
    if (event.code === 'Space') {
      event.preventDefault();
      state.toggleRunning();
    } else if (event.key === '1') state.setSpeed(1);
    else if (event.key === '2') state.setSpeed(2);
    else if (event.key === '4') state.setSpeed(4);
  };
  window.addEventListener('keydown', onKeyDown);

  const root = createRoot(rootElement);
  root.render(createElement(StrictMode, null, createElement(App, { mountCanvas })));

  return {
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown);
      loop.stop();
      root.unmount();
    },
  };
}
