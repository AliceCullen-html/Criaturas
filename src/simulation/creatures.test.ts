import { describe, it, expect } from 'vitest';
import { subjects } from '@core';
import { SystemScheduler, Transform, type Entity, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Bio, Creature, Emotions, Memory, Mind, Needs, Personality } from '@creatures';
import { createWorld, itemSystem, plantGrowthSystem, plantSpreadSystem, spawnFruit } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { foodIndexSystem } from './foodIndex';
import { creatureIndexSystem } from './creatureIndex';
import { emotionSystem } from './systems/emotionSystem';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { metabolismSystem } from './systems/metabolismSystem';
import { reproductionSystem } from './systems/reproductionSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';
import { offerItem, petCreature, roughGesture } from './handActions';

const CONFIG = { width: 1000, height: 1000 };

function makeWorld(seed: number, creatures = 8): World {
  const world = createWorld(CONFIG, seed);
  spawnCreatures(world, creatures);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

function fullScheduler(): SystemScheduler {
  return new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(emotionSystem)
    .add(decisionSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(reproductionSystem)
    .add(metabolismSystem)
    .add(itemSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);
}

function firstCreature(world: World): Entity {
  let found = -1;
  world.store(Creature).forEach((_tag, entity) => {
    if (found < 0) found = entity;
  });
  return found;
}

function run(world: World, steps: number): void {
  const scheduler = fullScheduler();
  for (let i = 0; i < steps; i++) scheduler.update(world, 1 / 20);
}

describe('metabolismo', () => {
  it('envelhece a criatura e aumenta a fome com o tempo', () => {
    const world = makeWorld(3);
    const id = firstCreature(world);
    const hungerBefore = world.store(Needs).get(id)!.hunger;
    const ageBefore = world.store(Bio).get(id)!.age;

    run(world, 200);

    expect(world.store(Bio).get(id)!.age).toBeGreaterThan(ageBefore);
    expect(world.store(Needs).get(id)!.hunger).toBeGreaterThan(hungerBefore);
  });
});

describe('vínculo com o jogador', () => {
  it('carinho lento aumenta a confiança', () => {
    const world = makeWorld(11);
    const id = firstCreature(world);
    const memory = world.store(Memory).get(id)!;
    const trustBefore = world.store(Emotions).get(id)!.trust;

    for (let i = 0; i < 40; i++) petCreature(world, id, 1 / 20);

    expect(world.store(Emotions).get(id)!.trust).toBeGreaterThan(trustBefore);
    expect(memory.valenceOf(subjects.player())).toBeGreaterThan(0);
  });

  it('gesto violento cria trauma que não passa rápido', () => {
    const world = makeWorld(12);
    const id = firstCreature(world);
    const memory = world.store(Memory).get(id)!;
    const emotions = world.store(Emotions).get(id)!;

    for (let i = 0; i < 3; i++) roughGesture(world, id, 1200, 1, 0);

    expect(emotions.fear).toBeGreaterThan(0.5);
    expect(emotions.trauma).toBeGreaterThan(0.3);
    expect(memory.valenceOf(subjects.player())).toBeLessThan(0);
    expect(memory.episodes[0]!.text).toContain('machuc');
    // A lembrança guarda quem, quando e onde.
    expect(memory.episodes[0]!.actor).toBe('você');
    expect(memory.episodes[0]!.intensity).toBeGreaterThan(0.7);

    // Muito carinho depois NÃO apaga o trauma nem devolve a confiança na hora.
    for (let i = 0; i < 200; i++) petCreature(world, id, 1 / 20);
    expect(emotions.trauma).toBeGreaterThan(0.2);
    expect(memory.valenceOf(subjects.player())).toBeLessThan(0);
  });

  it('a criatura recusa carinho de quem ela teme', () => {
    const world = makeWorld(13);
    const id = firstCreature(world);
    roughGesture(world, id, 1400, 1, 0);
    expect(petCreature(world, id, 1 / 20)).toBe('refused');
  });

  it('a criatura decide se aceita a comida oferecida', () => {
    const world = makeWorld(14, 1);
    const id = firstCreature(world);
    const transform = world.store(Transform).get(id)!;
    const needs = world.store(Needs).get(id)!;

    // Saciada: recusa.
    needs.hunger = 0.05;
    const fruit = spawnFruit(world, transform.x + 6, transform.y, { toxic: false, variant: 0 });
    expect(offerItem(world, fruit, id)).toBe(false);

    // Com fome: aceita.
    needs.hunger = 0.8;
    expect(offerItem(world, fruit, id)).toBe(true);
    expect(world.store(Needs).get(id)!.hunger).toBeLessThan(0.8);
  });
});

describe('inércia emocional', () => {
  it('o medo demora muito para passar', () => {
    const world = makeWorld(15, 1);
    const id = firstCreature(world);
    const emotions = world.store(Emotions).get(id)!;
    emotions.fear = 1;

    // 10 segundos de simulação não bastam para acalmar.
    const scheduler = fullScheduler();
    for (let i = 0; i < 200; i++) scheduler.update(world, 1 / 20);

    expect(world.store(Emotions).get(id)!.fear).toBeGreaterThan(0.6);
  });
});

describe('aprendizado por consequência', () => {
  it('aprende a evitar o alimento que fez mal', () => {
    const world = makeWorld(21, 1);
    const id = firstCreature(world);
    const memory = world.store(Memory).get(id)!;

    // Simula a experiência ruim: comeu um cogumelo (variante tóxica) e passou mal.
    memory.record(subjects.food(2), -1, 0.6);

    expect(memory.valenceOf(subjects.food(2))).toBeLessThan(0);
    // Um alimento nunca provado permanece neutro.
    expect(memory.valenceOf(subjects.food(0))).toBe(0);
  });

  it('memórias fortes resistem mais ao esquecimento que as fracas', () => {
    const world = makeWorld(22, 1);
    const memory = world.store(Memory).get(firstCreature(world))!;
    memory.record('trauma', -1, 1);
    memory.record('detalhe', 0.05, 1);

    for (let i = 0; i < 400; i++) memory.decay(1 / 20);

    expect(Math.abs(memory.valenceOf('trauma'))).toBeGreaterThan(
      Math.abs(memory.valenceOf('detalhe')),
    );
  });
});

describe('individualidade', () => {
  it('criaturas com genomas distintos tomam decisões distintas', () => {
    const world = makeWorld(31, 14);
    run(world, 600);

    const intents = new Set<string>();
    world.store(Creature).forEach((_tag, entity) => {
      const mind = world.store(Mind).get(entity);
      if (mind) intents.add(mind.intent);
    });

    // Sem scripts fixos, a população se distribui por várias intenções.
    expect(intents.size).toBeGreaterThan(1);
  });

  it('a personalidade varia entre indivíduos', () => {
    const world = makeWorld(32, 12);
    const curiosities = new Set<number>();
    world.store(Creature).forEach((_tag, entity) => {
      const traits = world.store(Personality).get(entity);
      if (traits) curiosities.add(Math.round(traits.curiosity * 100));
    });
    expect(curiosities.size).toBeGreaterThan(4);
  });
});

describe('determinismo', () => {
  it('a mesma seed produz o mesmo estado após N ticks', () => {
    const snapshot = (): number[] => {
      const world = makeWorld(99, 8);
      run(world, 300);
      const positions: number[] = [];
      world.store(Creature).forEach((_tag, entity) => {
        const transform = world.store(Transform).get(entity)!;
        positions.push(Math.round(transform.x), Math.round(transform.y));
      });
      return positions;
    };
    expect(snapshot()).toEqual(snapshot());
  });
});
