import { describe, it, expect } from 'vitest';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Emotions, Mind } from '@creatures';
import { createWorld, Item, SceneryResource, spawnFruit } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { foodIndexSystem, FoodIndexResource } from './foodIndex';
import { creatureIndexSystem } from './creatureIndex';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { searchSystem } from './systems/searchSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';
import { grabItem, releaseItem } from './handActions';

const CONFIG = { width: 1000, height: 1000 };

function makeWorld(seed = 3): World {
  const world = createWorld(CONFIG, seed);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

/** Move o objeto até a posição indicada e o larga (parado = pousar, rápido = atirar). */
function dropAt(
  world: World,
  id: number,
  x: number,
  y: number,
  vx = 0,
  vy = 0,
): ReturnType<typeof releaseItem> {
  const transform = world.store(Transform).get(id)!;
  grabItem(world, id);
  transform.x = x;
  transform.y = y;
  return releaseItem(world, id, vx, vy);
}

describe('empilhar objetos', () => {
  it('pousar um objeto sobre outro forma uma pilha', () => {
    const world = makeWorld();
    const base = spawnFruit(world, 400, 400, { toxic: false, variant: 0 });
    const top = spawnFruit(world, 700, 700, { toxic: false, variant: 0 });

    const drop = dropAt(world, top, 402, 401);

    expect(drop.stacked).toBe(1);
    expect(world.store(Item).get(top)!.stack).toBe(1);
    // A peça de cima encosta na de baixo: a pilha fica alinhada.
    const baseTransform = world.store(Transform).get(base)!;
    const topTransform = world.store(Transform).get(top)!;
    expect(topTransform.x).toBeCloseTo(baseTransform.x);
    expect(topTransform.y).toBeCloseTo(baseTransform.y);
  });

  it('a pilha tem altura máxima', () => {
    const world = makeWorld();
    spawnFruit(world, 400, 400, { toxic: false, variant: 0 });
    let last = 0;
    for (let i = 0; i < 5; i++) {
      const piece = spawnFruit(world, 700, 700, { toxic: false, variant: 0 });
      last = dropAt(world, piece, 400, 400).stacked;
    }
    expect(last).toBeLessThanOrEqual(3);
  });

  it('objeto arremessado não empilha — ele voa', () => {
    const world = makeWorld();
    spawnFruit(world, 400, 400, { toxic: false, variant: 0 });
    const thrown = spawnFruit(world, 700, 700, { toxic: false, variant: 0 });

    const drop = dropAt(world, thrown, 400, 400, 150, 0);

    expect(drop.stacked).toBe(0);
    expect(world.store(Item).get(thrown)!.vx).toBeCloseTo(150);
  });
});

describe('esconder atrás de uma pedra', () => {
  const rockOf = (world: World) => world.getResource(SceneryResource).find((p) => p.kind === 'rock');

  it('o objeto some do índice de comida enquanto está escondido', () => {
    const world = makeWorld();
    const rock = rockOf(world);
    expect(rock).toBeDefined();

    const fruit = spawnFruit(world, 700, 700, { toxic: false, variant: 0 });
    const drop = dropAt(world, fruit, rock!.x, rock!.y);
    expect(drop.hidden).toBe(true);
    expect(world.store(Item).get(fruit)!.hidden).toBe(true);

    foodIndexSystem.update(world, 0.05);
    const index = world.getResource(FoodIndexResource);
    const found: number[] = [];
    index.query(rock!.x, rock!.y, 60, found);
    expect(found).not.toContain(fruit);
  });

  it('pegar de volta tira o objeto do esconderijo', () => {
    const world = makeWorld();
    const rock = rockOf(world)!;
    const fruit = spawnFruit(world, 700, 700, { toxic: false, variant: 0 });
    dropAt(world, fruit, rock.x, rock.y);

    grabItem(world, fruit);
    expect(world.store(Item).get(fruit)!.hidden).toBe(false);
  });

  it('uma criatura curiosa que chega perto encontra o objeto', () => {
    const world = makeWorld();
    const rock = rockOf(world)!;
    const fruit = spawnFruit(world, 700, 700, { toxic: false, variant: 0 });
    dropAt(world, fruit, rock.x, rock.y);

    spawnCreatures(world, 1);
    let creatureId = -1;
    world.store(Mind).forEach((_mind, entity) => (creatureId = entity));
    const transform = world.store(Transform).get(creatureId)!;
    const spot = world.store(Transform).get(fruit)!;
    transform.x = spot.x + 4;
    transform.y = spot.y + 4;

    const before = world.store(Emotions).get(creatureId)!.curiosity;
    searchSystem.update(world, 0.05);

    expect(world.store(Item).get(fruit)!.hidden).toBe(false);
    expect(world.store(Emotions).get(creatureId)!.curiosity).toBeLessThan(before + 0.001);
  });

  it('quem está longe não encontra nada', () => {
    const world = makeWorld();
    const rock = rockOf(world)!;
    const fruit = spawnFruit(world, 700, 700, { toxic: false, variant: 0 });
    dropAt(world, fruit, rock.x, rock.y);

    spawnCreatures(world, 1);
    let creatureId = -1;
    world.store(Mind).forEach((_mind, entity) => (creatureId = entity));
    const transform = world.store(Transform).get(creatureId)!;
    const spot = world.store(Transform).get(fruit)!;
    transform.x = spot.x + 300;
    transform.y = spot.y;

    searchSystem.update(world, 0.05);
    expect(world.store(Item).get(fruit)!.hidden).toBe(true);
  });

  it('a curiosidade leva alguém até o esconderijo, e ele é encontrado', () => {
    const world = makeWorld(11);
    const rock = rockOf(world)!;
    const fruit = spawnFruit(world, 700, 700, { toxic: false, variant: 0 });
    dropAt(world, fruit, rock.x, rock.y);
    const spot = world.store(Transform).get(fruit)!;

    // Um grupo de criaturas em volta do esconderijo, todas curiosas.
    spawnCreatures(world, 8);
    const transforms = world.store(Transform);
    let i = 0;
    world.store(Emotions).forEach((emotions, entity) => {
      emotions.curiosity = 1;
      emotions.fear = 0;
      const transform = transforms.get(entity)!;
      const angle = (i++ / 8) * Math.PI * 2;
      transform.x = spot.x + Math.cos(angle) * 60;
      transform.y = spot.y + Math.sin(angle) * 60;
    });

    const scheduler = new SystemScheduler()
      .add(foodIndexSystem)
      .add(creatureIndexSystem)
      .add(decisionSystem)
      .add(movementSystem)
      .add(searchSystem);

    for (let tick = 0; tick < 200 && world.store(Item).get(fruit)!.hidden; tick++) {
      scheduler.update(world, 0.05);
    }

    expect(world.store(Item).get(fruit)!.hidden).toBe(false);
  });
});
