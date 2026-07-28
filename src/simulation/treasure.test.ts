import { describe, it, expect } from 'vitest';
import { subjects } from '@core';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Creature, Emotions, Memory, Needs, Nest, Personality } from '@creatures';
import { createWorld, Item, itemSystem, spawnGift, VARIANT } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { creatureIndexSystem } from './creatureIndex';
import { foodIndexSystem } from './foodIndex';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { planSystem } from './systems/planSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

const CONFIG = { width: 600, height: 600 };
const DT = 1 / 20;

/**
 * O GOSTO POR COISAS.
 *
 * A ferramenta de presente largava um ursinho na grama e o jardim inteiro
 * passava por cima dele. Um objeto que ninguém olha não é um presente: é
 * cenário. Aqui a criatura repara, vai buscar, leva para o canto dela — e
 * guarda a lembrança daquele tipo de coisa, que é de onde o gosto vem.
 */
function garden(seed = 8): { world: World; id: number } {
  const world = createWorld(CONFIG, seed);
  spawnCreatures(world, 1);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  let id = -1;
  world.store(Creature).forEach((_tag, entity) => {
    if (id < 0) id = entity;
  });
  // Sem urgências: uma criatura faminta não vai colecionar nada, e é assim
  // que tem de ser.
  const needs = world.store(Needs).get(id)!;
  needs.hunger = 0.1;
  needs.thirst = 0.1;
  needs.energy = 1;
  const emotions = world.store(Emotions).get(id)!;
  emotions.fear = 0;
  emotions.curiosity = 0.9;
  const traits = world.store(Personality).get(id)!;
  traits.curiosity = 0.9;
  traits.playfulness = 0.8;
  return { world, id };
}

const scheduler = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(planSystem)
    .add(decisionSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(itemSystem);

describe('a criatura guarda o que ela gosta', () => {
  it('vai buscar o presente e leva para o canto dela', () => {
    const { world, id } = garden();
    const here = world.store(Transform).get(id)!;
    // O ninho de um lado, o presente do outro: a viagem tem de acontecer.
    world.store(Nest).set(id, { x: here.x - 60, y: here.y, attachment: 0.5 });
    const gift = spawnGift(world, here.x + 70, here.y + 20, VARIANT.giftFlower);

    const run = scheduler();
    let carregou = false;
    for (let tick = 0; tick < 20 * 90; tick++) {
      run.update(world, DT);
      if (world.store(Item).get(gift)?.carriedBy === id) carregou = true;
    }

    const nest = world.store(Nest).get(id)!;
    const onde = world.store(Transform).get(gift)!;
    const distancia = Math.hypot(onde.x - nest.x, onde.y - nest.y);
    const gosto = world.store(Memory).get(id)!.valenceOf(subjects.thing(VARIANT.giftFlower));

    expect(carregou, 'nem chegou a pegar a flor').toBe(true);
    expect(distancia, `largou a flor a ${distancia.toFixed(0)}px do ninho`).toBeLessThan(40);
    expect(gosto, 'guardou a flor e não guardou a lembrança').toBeGreaterThan(0.3);
  });

  it('e, tendo escolha, prefere o tipo de coisa que já gostou', () => {
    const { world, id } = garden();
    const here = world.store(Transform).get(id)!;
    world.store(Nest).set(id, { x: here.x, y: here.y - 50, attachment: 0.5 });
    // Ela já aprendeu a gostar de pedra bonita.
    world.store(Memory).get(id)!.record(subjects.thing(VARIANT.shinyRock), 1, 0.8);

    // Duas coisas à mesma distância, uma de cada lado.
    const flor = spawnGift(world, here.x - 60, here.y + 10, VARIANT.giftFlower);
    const pedra = spawnGift(world, here.x + 60, here.y + 10, VARIANT.shinyRock);

    const run = scheduler();
    let escolhida = -1;
    for (let tick = 0; tick < 20 * 60 && escolhida < 0; tick++) {
      run.update(world, DT);
      if (world.store(Item).get(flor)?.carriedBy === id) escolhida = flor;
      if (world.store(Item).get(pedra)?.carriedBy === id) escolhida = pedra;
    }

    expect(escolhida, 'não pegou nem uma coisa nem outra').toBeGreaterThan(-1);
    expect(escolhida, 'ignorou o próprio gosto').toBe(pedra);
  });

  it('mas de barriga vazia ninguém coleciona nada', () => {
    const { world, id } = garden();
    const here = world.store(Transform).get(id)!;
    world.store(Nest).set(id, { x: here.x, y: here.y - 50, attachment: 0.5 });
    world.store(Needs).get(id)!.hunger = 0.9;
    const gift = spawnGift(world, here.x + 40, here.y, VARIANT.bear);

    const run = scheduler();
    for (let tick = 0; tick < 20 * 30; tick++) run.update(world, DT);

    expect(world.store(Item).get(gift)?.carriedBy).toBe(-1);
  });
});
