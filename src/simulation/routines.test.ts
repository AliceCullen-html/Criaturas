import { describe, it, expect } from 'vitest';
import { subjects } from '@core';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Creature, Emotions, Memory, Needs, Personality } from '@creatures';
import {
  ambientSystem,
  createWorld,
  dayNightSystem,
  itemSystem,
  Item,
  plantGrowthSystem,
  plantSpreadSystem,
  propSystem,
  spawnFruit,
  weatherSystem,
  isWaterAt,
  TerrainResource,
} from '@world';
import { spawnCreatures } from './spawnCreatures';
import { foodIndexSystem } from './foodIndex';
import { creatureIndexSystem } from './creatureIndex';
import { emotionSystem } from './systems/emotionSystem';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { metabolismSystem } from './systems/metabolismSystem';
import { reproductionSystem } from './systems/reproductionSystem';
import { searchSystem } from './systems/searchSystem';
import { idleSystem } from './systems/idleSystem';
import { confinementSystem } from './systems/confinementSystem';
import { planSystem, Plan } from './systems/planSystem';
import { ROUTINE, ROUTINE_NAMES, carriedBy } from './routines';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * Pequenas histórias.
 *
 * O que se cobra aqui não é uma ação: é a CORRENTE. Achar a fruta, parar para
 * olhar em volta, pegar, atravessar o jardim, entregar — e, do outro lado, ser
 * roubada, reclamar e depois fazer as pazes. Sem a camada de rotinas cada elo
 * seria uma decisão independente que não conhece a anterior, e nada disso
 * chegaria ao fim.
 */

const WORLD = { width: 600, height: 600 };
const DT = 1 / 20;

function makeGarden(seed: number, creatures = 12): World {
  const world = createWorld(WORLD, seed);
  spawnCreatures(world, creatures);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

const full = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(emotionSystem)
    .add(planSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(reproductionSystem)
    .add(metabolismSystem)
    .add(confinementSystem)
    .add(itemSystem)
    .add(searchSystem)
    .add(weatherSystem)
    .add(dayNightSystem)
    .add(ambientSystem)
    .add(propSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);

/**
 * Um palco seco.
 *
 * Estas cenas precisam de uns setenta pixels de chão livre lado a lado. Antes
 * o palco era "onde a primeira criatura tiver nascido", e isso funcionava por
 * acaso: as criaturas nasciam em qualquer lugar, então quase sempre havia
 * terra à direita delas. Desde que passaram a nascer perto da água, esse
 * "à direita" cai dentro do lago com frequência — a fruta aparecia boiando e a
 * história não podia acontecer. O palco agora é PROCURADO, não presumido.
 */
function dryStage(world: World, span = 80): { x: number; y: number } {
  const terrain = world.getResource(TerrainResource);
  const dry = (x: number, y: number): boolean =>
    x > 20 &&
    y > 20 &&
    x < world.config.width - 20 &&
    y < world.config.height - 20 &&
    !isWaterAt(terrain, x, y);

  for (let y = 60; y < world.config.height - 60; y += 20) {
    for (let x = 60; x < world.config.width - 60 - span; x += 20) {
      let clear = true;
      for (let step = 0; step <= span && clear; step += 10) {
        if (!dry(x + step, y) || !dry(x + step, y + 12)) clear = false;
      }
      if (clear) return { x, y };
    }
  }
  throw new Error('nenhum trecho seco no jardim — o mundo virou lago');
}

const ids = (world: World): number[] => {
  const out: number[] = [];
  world.store(Creature).forEach((_tag, entity) => out.push(entity));
  return out;
};

describe('pequenas histórias', () => {
  it('uma criatura gentil pega uma fruta e leva para quem está com fome', () => {
    const world = makeGarden(11, 2);
    const [giver, hungry] = ids(world) as [number, number];

    // A doadora é gentil e está satisfeita; a outra, com fome.
    const traits = world.store(Personality).get(giver)!;
    traits.kindness = 1;
    world.store(Needs).get(giver)!.hunger = 0.1;
    world.store(Needs).get(giver)!.thirst = 0.1;
    world.store(Emotions).get(giver)!.fear = 0;
    const hungryNeeds = world.store(Needs).get(hungry)!;
    hungryNeeds.hunger = 0.6;
    hungryNeeds.thirst = 0.1;
    // E gosta de quem vai receber.
    world.store(Memory).get(giver)!.record(subjects.creature(hungry), 1, 1);

    const stage = dryStage(world);
    const spot = world.store(Transform).get(giver)!;
    spot.x = stage.x;
    spot.y = stage.y;
    const theirs = world.store(Transform).get(hungry)!;
    theirs.x = stage.x + 70;
    theirs.y = stage.y;
    spawnFruit(world, stage.x + 25, stage.y + 10, { toxic: false, variant: 0 });

    const scheduler = full();
    let carried = false;
    let delivered = false;
    const hungerBefore = hungryNeeds.hunger;

    for (let tick = 0; tick < 20 * 60; tick++) {
      scheduler.update(world, DT);
      if (carriedBy(world, giver) >= 0) carried = true;
      if (carried && hungryNeeds.hunger < hungerBefore - 0.2) {
        delivered = true;
        break;
      }
    }

    expect(carried, 'nunca chegou a pegar a fruta').toBe(true);
    expect(delivered, 'pegou mas não entregou').toBe(true);
    // A entrega vale mais que a comida: fica na memória de quem recebeu.
    expect(world.store(Memory).get(hungry)!.valenceOf(subjects.creature(giver))).toBeGreaterThan(
      0.3,
    );
  });

  it('roubar gera indignação, e a vítima vai reclamar sozinha', () => {
    const world = makeGarden(21, 2);
    const [thief, victim] = ids(world) as [number, number];

    // A vítima está carregando uma fruta.
    const fruit = spawnFruit(world, 300, 300, { toxic: false, variant: 0 });
    world.store(Item).get(fruit)!.carriedBy = victim;

    // O ladrão está com fome e não é lá muito gentil.
    const thiefTraits = world.store(Personality).get(thief)!;
    thiefTraits.kindness = 0.05;
    thiefTraits.aggression = 0.8;
    world.store(Needs).get(thief)!.hunger = 0.6;
    world.store(Emotions).get(thief)!.fear = 0;
    // A vítima é briguenta o bastante para reclamar.
    const victimTraits = world.store(Personality).get(victim)!;
    victimTraits.aggression = 0.9;
    victimTraits.kindness = 0.1;
    world.store(Emotions).get(victim)!.fear = 0;
    world.store(Needs).get(victim)!.hunger = 0.2;

    const transforms = world.store(Transform);
    transforms.get(victim)!.x = 300;
    transforms.get(victim)!.y = 300;
    transforms.get(thief)!.x = 340;
    transforms.get(thief)!.y = 300;

    const scheduler = full();
    let stolen = false;
    let protested = false;

    for (let tick = 0; tick < 20 * 90; tick++) {
      scheduler.update(world, DT);
      if (!stolen && carriedBy(world, thief) === fruit) stolen = true;
      if (stolen && world.store(Plan).get(victim)?.routine === ROUTINE.protest) {
        protested = true;
        break;
      }
    }

    expect(stolen, 'o roubo não aconteceu').toBe(true);
    expect(protested, 'a vítima levou o roubo calada').toBe(true);
    // E guardou de quem foi.
    expect(world.store(Memory).get(victim)!.valenceOf(subjects.creature(thief))).toBeLessThan(0);
  });

  it('depois da briga, quem é gentil procura a outra e faz as pazes', () => {
    const world = makeGarden(31, 2);
    const [a, b] = ids(world) as [number, number];

    // Estão de mal — mas a primeira é gentil e sociável.
    const memoryA = world.store(Memory).get(a)!;
    memoryA.record(subjects.creature(b), -0.9, 1);
    const traits = world.store(Personality).get(a)!;
    traits.kindness = 1;
    traits.sociability = 1;
    for (const entity of [a, b]) {
      const emotions = world.store(Emotions).get(entity)!;
      emotions.anger = 0;
      emotions.fear = 0;
      const needs = world.store(Needs).get(entity)!;
      needs.hunger = 0.15;
      needs.thirst = 0.15;
    }
    const transforms = world.store(Transform);
    transforms.get(a)!.x = 300;
    transforms.get(a)!.y = 300;
    transforms.get(b)!.x = 360;
    transforms.get(b)!.y = 300;

    const before = memoryA.valenceOf(subjects.creature(b));
    const scheduler = full();
    for (let tick = 0; tick < 20 * 90; tick++) scheduler.update(world, DT);

    // Fazer as pazes não apaga a mágoa, mas empurra de volta para o azul.
    expect(
      memoryA.valenceOf(subjects.creature(b)),
      'continuaram de mal para sempre',
    ).toBeGreaterThan(before);
  });

  it('num jardim comum, as histórias acontecem sozinhas', () => {
    const world = makeGarden(1337, 18);
    const scheduler = full();

    // Conta rotinas que CHEGARAM AO FIM — começar é fácil, terminar é o que
    // vira história.
    const finished = new Map<number, number>();
    const running = new Map<number, { routine: number; step: number }>();

    for (let tick = 0; tick < 20 * 60 * 10; tick++) {
      scheduler.update(world, DT);
      world.store(Plan).forEach((plan, entity) => {
        const before = running.get(entity);
        if (before && before.routine !== ROUTINE.none && plan.routine === ROUTINE.none) {
          const steps = { 1: 5, 2: 2, 3: 2, 4: 2 }[before.routine] ?? 99;
          // Só conta se saiu pelo último passo, não por abandono.
          if (before.step >= steps - 1) {
            finished.set(before.routine, (finished.get(before.routine) ?? 0) + 1);
          }
        }
        running.set(entity, { routine: plan.routine, step: plan.step });
      });
    }

    const total = [...finished.values()].reduce((sum, n) => sum + n, 0);
    const report = [...finished.entries()]
      .map(([routine, count]) => `${ROUTINE_NAMES[routine]}: ${count}`)
      .join(' · ');
    console.log(`10 minutos de jardim — ${total} histórias completas\n${report}`);

    expect(total, `nenhuma história chegou ao fim — ${report}`).toBeGreaterThan(3);
  });

  it('fome de verdade cancela a história: ninguém presenteia de barriga vazia', () => {
    const world = makeGarden(41, 2);
    const [giver, other] = ids(world) as [number, number];
    world.store(Personality).get(giver)!.kindness = 1;
    world.store(Memory).get(giver)!.record(subjects.creature(other), 1, 1);
    world.store(Needs).get(other)!.hunger = 0.6;

    const stage = dryStage(world);
    const spot = world.store(Transform).get(giver)!;
    spot.x = stage.x;
    spot.y = stage.y;
    world.store(Transform).get(other)!.x = stage.x + 70;
    world.store(Transform).get(other)!.y = stage.y;
    spawnFruit(world, stage.x + 25, stage.y, { toxic: false, variant: 0 });

    const scheduler = full();
    for (let tick = 0; tick < 20 * 20; tick++) {
      // Mantém a doadora faminta o tempo todo.
      world.store(Needs).get(giver)!.hunger = 0.9;
      scheduler.update(world, DT);
      expect(world.store(Plan).get(giver)?.routine ?? ROUTINE.none).not.toBe(ROUTINE.bringFood);
    }
  });
});
