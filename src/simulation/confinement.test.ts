import { describe, it, expect } from 'vitest';
import { subjects } from '@core';
import { SystemScheduler, Transform, Velocity, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Creature, Emotions, Memory } from '@creatures';
import { createWorld, spawnBoulder } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { foodIndexSystem } from './foodIndex';
import { creatureIndexSystem } from './creatureIndex';
import { emotionSystem } from './systems/emotionSystem';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { confinementSystem } from './systems/confinementSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * Prender uma criatura com pedras.
 *
 * A pedra grande não tem regra especial nenhuma: ela só é sólida. Encurralar
 * alguém é consequência disso, e o medo é consequência de perceber que não há
 * saída — exatamente como o trauma do gesto brusco.
 */

const CONFIG = { width: 600, height: 600 };

function makeWorld(): World {
  const world = createWorld(CONFIG, 5);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

const run = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(emotionSystem)
    .add(decisionSystem)
    .add(movementSystem)
    .add(confinementSystem);

/** Fecha o canto superior esquerdo com uma parede de pedras. */
function wallOffCorner(world: World): void {
  for (let y = 0; y <= 100; y += 26) spawnBoulder(world, 100, y);
  for (let x = 0; x <= 100; x += 26) spawnBoulder(world, x, 100);
}

/** Põe uma criatura sozinha no ponto pedido. */
function loneCreature(world: World, x: number, y: number): number {
  spawnCreatures(world, 1);
  let id = -1;
  world.store(Creature).forEach((_tag, entity) => {
    if (id < 0) id = entity;
  });
  const transform = world.store(Transform).get(id)!;
  transform.x = x;
  transform.y = y;
  transform.prevX = x;
  transform.prevY = y;
  return id;
}

describe('pedras grandes', () => {
  it('a criatura não atravessa uma pedra', () => {
    const world = makeWorld();
    const id = loneCreature(world, 200, 200);
    spawnBoulder(world, 230, 200);

    // Empurra a criatura contra a pedra por alguns segundos.
    const transform = world.store(Transform).get(id)!;
    world.store(Velocity).set(id, { x: 60, y: 0 });
    for (let tick = 0; tick < 60; tick++) {
      world.store(Velocity).set(id, { x: 60, y: 0 });
      movementSystem.update(world, 1 / 20);
    }

    expect(transform.x, 'atravessou a pedra').toBeLessThan(230);
  });

  it('cercada num canto, a criatura sente medo e guarda o lugar como ruim', () => {
    const world = makeWorld();
    const id = loneCreature(world, 40, 40);
    wallOffCorner(world);

    const emotions = world.store(Emotions).get(id)!;
    emotions.fear = 0;
    const memory = world.store(Memory).get(id)!;
    const scheduler = run();

    for (let tick = 0; tick < 20 * 25; tick++) scheduler.update(world, 1 / 20);

    const transform = world.store(Transform).get(id)!;
    expect(emotions.fear, 'não sentiu medo de estar presa').toBeGreaterThan(0.6);
    expect(emotions.stress).toBeGreaterThan(0.4);
    expect(memory.valenceOf(subjects.place(transform.x, transform.y))).toBeLessThan(0);
    // Culpa quem construiu a parede.
    expect(memory.valenceOf(subjects.player())).toBeLessThan(0);
    // E continua presa: a parede segura.
    expect(transform.x, 'escapou pela parede').toBeLessThan(100);
    expect(transform.y, 'escapou pela parede').toBeLessThan(100);
  });

  it('no jardim aberto ninguém se sente preso', () => {
    const world = makeWorld();
    const id = loneCreature(world, 300, 300);
    // Uma pedra só não cerca nada.
    spawnBoulder(world, 340, 300);

    const emotions = world.store(Emotions).get(id)!;
    emotions.fear = 0;
    const scheduler = run();

    for (let tick = 0; tick < 20 * 25; tick++) scheduler.update(world, 1 / 20);

    expect(emotions.fear, 'sentiu medo sem estar presa').toBeLessThan(0.3);
  });

  it('tirando a parede, o medo passa — mas a lembrança do lugar fica', () => {
    const world = makeWorld();
    const id = loneCreature(world, 40, 40);
    wallOffCorner(world);
    const emotions = world.store(Emotions).get(id)!;
    const memory = world.store(Memory).get(id)!;
    const scheduler = run();

    for (let tick = 0; tick < 20 * 25; tick++) scheduler.update(world, 1 / 20);
    const trapped = { x: 40, y: 40 };
    expect(emotions.fear).toBeGreaterThan(0.6);

    // O jogador desfaz a parede.
    const boulders: number[] = [];
    world.store(Transform).forEach((_transform, entity) => {
      if (world.store(Creature).has(entity)) return;
      boulders.push(entity);
    });
    for (const entity of boulders) world.destroyEntity(entity);

    for (let tick = 0; tick < 20 * 240; tick++) scheduler.update(world, 1 / 20);

    expect(emotions.fear, 'o medo não passou depois de solta').toBeLessThan(0.5);
    expect(
      memory.valenceOf(subjects.place(trapped.x, trapped.y)),
      'esqueceu o lugar onde ficou presa',
    ).toBeLessThan(0);
  });
});
