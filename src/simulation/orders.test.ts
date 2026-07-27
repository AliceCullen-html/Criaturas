import { describe, it, expect } from 'vitest';
import { subjects } from '@core';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Creature, Emotions, Memory, Mind, Needs } from '@creatures';
import {
  ambientSystem,
  createWorld,
  dayNightSystem,
  itemSystem,
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
import { searchSystem } from './systems/searchSystem';
import { idleSystem } from './systems/idleSystem';
import { confinementSystem } from './systems/confinementSystem';
import { planSystem } from './systems/planSystem';
import { Order, ORDER, issueOrder, orderSystem } from './orders';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * ORDENS DO JOGADOR.
 *
 * Existe uma tensão aqui, e ela é o coração do projeto: a regra principal diz
 * que a criatura nunca pode parecer um NPC esperando ordens — e selecionar um
 * grupo e mandá-lo andar é, literalmente, dar ordens.
 *
 * A saída não foi enfraquecer o comando, foi dar a ele um custo: a criatura
 * DECIDE se obedece. O que se cobra aqui é justamente isso — que a ordem
 * funcione para quem confia, e que ela seja recusada por quem tem medo ou tem
 * problema próprio. É a recusa que separa uma criatura de um peão.
 */

const WORLD = { width: 600, height: 600 };
const DT = 1 / 20;

function garden(seed: number, count = 4): World {
  const world = createWorld(WORLD, seed);
  spawnCreatures(world, count);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

const scheduler = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(emotionSystem)
    .add(orderSystem)
    .add(planSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
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

const first = (world: World): number => {
  let id = -1;
  world.store(Creature).forEach((_tag, entity) => {
    if (id < 0) id = entity;
  });
  return id;
};

/** Um ponto seco a uma boa distância — para a ordem ter caminho a percorrer. */
function dryPoint(world: World, fromX: number, fromY: number): { x: number; y: number } {
  const terrain = world.getResource(TerrainResource);
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 60; y < WORLD.height - 60; y += 20) {
    for (let x = 60; x < WORLD.width - 60; x += 20) {
      if (isWaterAt(terrain, x, y)) continue;
      const d = Math.hypot(x - fromX, y - fromY);
      if (d < 90 || d > 200) continue;
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (!best) throw new Error('jardim sem ponto seco a distância útil');
  return best;
}

describe('mandar as criaturas', () => {
  it('quem confia em você vai até onde você mandou', () => {
    const world = garden(1337);
    const id = first(world);
    world.store(Memory).get(id)!.record(subjects.player(), 1, 1);
    world.store(Emotions).get(id)!.fear = 0;
    const needs = world.store(Needs).get(id)!;
    needs.hunger = 0.2;
    needs.thirst = 0.2;

    const here = world.store(Transform).get(id)!;
    const alvo = dryPoint(world, here.x, here.y);
    const antes = Math.hypot(here.x - alvo.x, here.y - alvo.y);

    expect(issueOrder(world, id, ORDER.move, alvo.x, alvo.y)).toBe('accepted');

    const run = scheduler();
    let chegou = false;
    let maisPerto = antes;
    for (let tick = 0; tick < 20 * 25 && !chegou; tick++) {
      run.update(world, DT);
      const agora = world.store(Transform).get(id);
      if (!agora) break;
      const d = Math.hypot(agora.x - alvo.x, agora.y - alvo.y);
      maisPerto = Math.min(maisPerto, d);
      if (!world.store(Order).has(id)) chegou = true;
    }
    console.log(`estava a ${antes.toFixed(0)}px; chegou a ${maisPerto.toFixed(0)}px`);
    // Andou de verdade na direção do ponto — não é um passinho de cortesia.
    expect(maisPerto, `mal saiu do lugar (${maisPerto.toFixed(0)}px)`).toBeLessThan(antes * 0.4);
    // E a ordem se encerra sozinha ao ser cumprida: ela volta a viver a vida.
    expect(chegou, 'a ordem ficou grudada nela').toBe(true);
    expect(world.store(Order).has(id)).toBe(false);
  });

  it('quem tem medo de você não obedece — e isso é informação, não bug', () => {
    const world = garden(7);
    const id = first(world);
    const memory = world.store(Memory).get(id)!;
    memory.record(subjects.player(), -1, 1);

    const here = world.store(Transform).get(id)!;
    expect(issueOrder(world, id, ORDER.move, here.x + 120, here.y)).toBe('refused');
    expect(world.store(Order).has(id), 'aceitou uma ordem de quem ela teme').toBe(false);

    // E quem passou a confiar volta a obedecer: o vínculo é o que manda.
    memory.record(subjects.player(), 1, 3);
    world.store(Emotions).get(id)!.fear = 0;
    expect(issueOrder(world, id, ORDER.move, here.x + 120, here.y)).toBe('accepted');
  });

  it('problema próprio vem antes da ordem', () => {
    const world = garden(21);
    const id = first(world);
    world.store(Memory).get(id)!.record(subjects.player(), 1, 1);
    const needs = world.store(Needs).get(id)!;
    const here = world.store(Transform).get(id)!;

    needs.thirst = 0.95;
    expect(issueOrder(world, id, ORDER.move, here.x + 100, here.y)).toBe('refused');

    needs.thirst = 0.2;
    needs.hunger = 0.2;
    world.store(Emotions).get(id)!.pain = 0.8;
    expect(issueOrder(world, id, ORDER.move, here.x + 100, here.y)).toBe('refused');

    // E uma ordem já em curso é largada quando a urgência chega.
    world.store(Emotions).get(id)!.pain = 0;
    expect(issueOrder(world, id, ORDER.move, here.x + 100, here.y)).toBe('accepted');
    needs.hunger = 0.99;
    scheduler().update(world, DT);
    expect(world.store(Order).has(id), 'seguiu a ordem morrendo de fome').toBe(false);
  });

  it('mandar comer aponta a criatura para AQUELA fruta', () => {
    const world = garden(31);
    const id = first(world);
    world.store(Memory).get(id)!.record(subjects.player(), 1, 1);
    const needs = world.store(Needs).get(id)!;
    needs.hunger = 0.5;
    needs.thirst = 0.2;

    const here = world.store(Transform).get(id)!;
    const alvo = dryPoint(world, here.x, here.y);
    const fruta = spawnFruit(world, alvo.x, alvo.y, { toxic: false, variant: 0 });

    expect(issueOrder(world, id, ORDER.eat, alvo.x, alvo.y, fruta)).toBe('accepted');
    const run = scheduler();
    for (let tick = 0; tick < 6; tick++) run.update(world, DT);

    const mind = world.store(Mind).get(id)!;
    expect(mind.intent, 'não foi atrás da fruta').toBe('seekFood');
    expect(mind.targetEntity, 'foi atrás de outra coisa').toBe(fruta);
  });

  it('a ordem tem prazo: ela não persegue um ponto para sempre', () => {
    const world = garden(41);
    const id = first(world);
    world.store(Memory).get(id)!.record(subjects.player(), 1, 1);
    world.store(Needs).get(id)!.hunger = 0.2;
    world.store(Needs).get(id)!.thirst = 0.2;

    // Um alvo dentro do lago: ela nunca chega lá.
    const terrain = world.getResource(TerrainResource);
    let lago: { x: number; y: number } | null = null;
    for (let y = 10; y < WORLD.height && !lago; y += 5) {
      for (let x = 10; x < WORLD.width && !lago; x += 5) {
        if (isWaterAt(terrain, x, y)) lago = { x, y };
      }
    }
    expect(lago, 'jardim sem lago').not.toBeNull();

    expect(issueOrder(world, id, ORDER.move, lago!.x, lago!.y)).toBe('accepted');
    const run = scheduler();
    for (let tick = 0; tick < 20 * 30; tick++) run.update(world, DT);
    expect(world.store(Order).has(id), 'ficou presa numa ordem impossível').toBe(false);
  });
});
