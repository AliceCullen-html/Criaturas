import { describe, it, expect } from 'vitest';
import { POSE, subjects } from '@core';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Attributes, Behavior, Creature, Emotions, Memory, Mind, Needs } from '@creatures';
import { Item, createWorld, spawnFruit } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { foodIndexSystem } from './foodIndex';
import { creatureIndexSystem } from './creatureIndex';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { idleSystem } from './systems/idleSystem';
import { feedCreature } from './toolActions';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';
import { scrub } from './toolActions';

const CONFIG = { width: 600, height: 600 };

function makeWorld(seed = 11): World {
  const world = createWorld(CONFIG, seed);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

/** O primeiro (e único, nestes testes) bicho do jardim. */
function someone(world: World): number {
  let id = -1;
  world.store(Creature).forEach((_tag, entity) => {
    if (id < 0) id = entity;
  });
  return id;
}

/**
 * CUIDAR TEM DE APARECER.
 *
 * Comer e tomar banho aconteciam só na ficha: o número descia e o desenho
 * ficava igual. O jogador esfregava, esfregava, e não tinha nenhuma prova de
 * que estava funcionando — o que na prática é o mesmo que não funcionar.
 */
describe('o que a criatura faz aparece no corpo dela', () => {
  it('comendo, ela abre a boca', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const spot = world.store(Transform).get(id)!;
    world.store(Needs).get(id)!.hunger = 0.8;

    const fruit = spawnFruit(world, spot.x + 3, spot.y + 3, { toxic: false, variant: 0 });
    const mind = world.store(Mind).get(id)!;
    mind.intent = 'seekFood';
    mind.targetEntity = fruit;
    mind.commitment = 5;

    new SystemScheduler().add(actionSystem).update(world, 0.05);

    expect(world.store(Behavior).get(id)!.pose).toBe(POSE.eat);
  });

  it('e a fome não apaga a pose de comer — comer é a resposta à fome', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const spot = world.store(Transform).get(id)!;
    // Fome bem acima do limiar que faz o ócio cancelar qualquer gesto.
    world.store(Needs).get(id)!.hunger = 0.95;

    const fruit = spawnFruit(world, spot.x + 3, spot.y + 3, { toxic: false, variant: 0 });
    const mind = world.store(Mind).get(id)!;
    mind.intent = 'seekFood';
    mind.targetEntity = fruit;
    mind.commitment = 5;

    const scheduler = new SystemScheduler().add(actionSystem).add(idleSystem);
    scheduler.update(world, 0.05);

    expect(world.store(Behavior).get(id)!.pose).toBe(POSE.eat);
  });

  it('esfregada, ela toma banho — e o desenho diz isso', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    world.store(Needs).get(id)!.dirt = 0.8;
    world.store(Emotions).get(id)!.fear = 0;

    expect(scrub(world, id, 0.1)).toBe('scrubbing');
    expect(world.store(Behavior).get(id)!.pose).toBe(POSE.bathe);
  });

  it('mas quem está com medo não toma banho nenhum', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    world.store(Needs).get(id)!.dirt = 0.8;
    world.store(Emotions).get(id)!.fear = 0.9;

    expect(scrub(world, id, 0.1)).toBe('refused');
    expect(world.store(Behavior).get(id)!.pose).not.toBe(POSE.bathe);
  });
});

/**
 * FOME É ATENÇÃO.
 *
 * Medido no jogo: fome em 0,95, uma fruta a cinquenta pixels, e a criatura
 * brincando de bola até morrer. Não era falta de vontade de comer — a vista
 * dela alcança oitenta pixels num jardim de novecentos, e comida era a única
 * necessidade que dependia inteiramente de sorte.
 */
describe('quem está com fome procura comida', () => {
  it('enxerga a fruta que a criatura satisfeita nem repara', () => {
    const passos = (fome: number): string => {
      const world = makeWorld(5);
      spawnCreatures(world, 1);
      const id = someone(world);
      const spot = world.store(Transform).get(id)!;
      const needs = world.store(Needs).get(id)!;
      needs.hunger = fome;
      needs.thirst = 0.1;
      needs.energy = 1;
      world.store(Emotions).get(id)!.fear = 0;

      // Uma fruta e meia vista adiante: fora do alcance de quem está saciado.
      const vision = world.store(Attributes).get(id)!.vision;
      spawnFruit(world, spot.x + vision * 1.5, spot.y, { toxic: false, variant: 0 });
      world.store(Mind).get(id)!.commitment = 0;

      const scheduler = new SystemScheduler()
        .add(foodIndexSystem)
        .add(creatureIndexSystem)
        .add(decisionSystem)
        .add(movementSystem);
      scheduler.update(world, 0.05);
      return world.store(Mind).get(id)!.intent;
    };

    expect(passos(0.95)).toBe('seekFood');
    expect(passos(0.1)).not.toBe('seekFood');
  });
});

/**
 * A RECUSA.
 *
 * O momento que faltava no jogo inteiro. Oferecer comida a uma criatura que
 * passou mal com aquela fruta e a uma criatura sem fome dava exatamente a mesma
 * coisa: a fruta caía no chão e ela ia embora. O jogador não tinha como
 * distinguir "não quero agora" de "isso me fez mal".
 *
 * E sem esse instante o artista tinha duas tiras — recusar comida e negar
 * comida — sem lugar nenhum onde caber, porque não existia recusa no mundo para
 * elas desenharem. É a ordem certa: primeiro o mundo passa a fazer a coisa,
 * depois o desenho pode mostrá-la.
 */
describe('ela pode dizer não', () => {
  it('quem passou mal com aquela fruta vira a cara em vez de aceitar', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    world.store(Memory).get(id)!.record(subjects.food(0), -0.9, 1);

    const antes = world.store(Item).size;
    expect(feedCreature(world, id), 'aceitou a fruta que a fez passar mal').toBe('refused');
    expect(world.store(Item).size, 'largou a fruta mesmo recusando').toBe(antes);
    expect(world.store(Behavior).get(id)!.pose, 'recusou sem virar a cara').toBe(POSE.refuse);
  });

  it('e quem tem medo de você também', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    world.store(Memory).get(id)!.record(subjects.player(), -0.9, 1);
    expect(feedCreature(world, id), 'aceitou comida de quem ela teme').toBe('refused');
  });

  it('mas sem motivo nenhum ela aceita — a recusa custa alguma coisa', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const antes = world.store(Item).size;
    expect(feedCreature(world, id), 'recusou sem ter por quê').toBe('given');
    expect(world.store(Item).size, 'aceitou e a fruta não apareceu').toBe(antes + 1);
  });
});
