import { describe, it, expect } from 'vitest';
import { POSE, subjects } from '@core';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Attributes, Behavior, Creature, Emotions, Memory, Needs } from '@creatures';
import { createWorld } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { emotionSystem } from './systems/emotionSystem';
import { idleSystem } from './systems/idleSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';
import { roughGesture } from './handActions';

/**
 * Bater dói — e a dor aparece.
 *
 * O ponto não é o dano: é o SOFRIMENTO ser legível. A criatura encolhe, manca,
 * o rosto se fecha, e quem estava por perto e viu a cena aprende a temer a mão
 * do jogador sem nunca ter apanhado. A dor passa em minutos; a lembrança de
 * quem bateu, não.
 */

const CONFIG = { width: 600, height: 600 };

function makeWorld(count = 1): World {
  const world = createWorld(CONFIG, 3);
  spawnCreatures(world, count);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

const ids = (world: World): number[] => {
  const out: number[] = [];
  world.store(Creature).forEach((_tag, entity) => out.push(entity));
  return out;
};

describe('bater e ver sofrer', () => {
  it('a pancada machuca de verdade e o corpo mostra', () => {
    const world = makeWorld();
    const id = ids(world)[0]!;
    const emotions = world.store(Emotions).get(id)!;
    const needs = world.store(Needs).get(id)!;
    const healthBefore = needs.health;

    roughGesture(world, id, 1400, 1, 0);

    expect(emotions.pain, 'não sentiu dor').toBeGreaterThan(0.5);
    expect(needs.health).toBeLessThan(healthBefore);
    // O corpo encolhe na hora — é o que se vê na tela.
    expect(world.store(Behavior).get(id)!.pose).toBe(POSE.hurt);
  });

  it('enquanto dói, ela fica encolhida e não sai do lugar', () => {
    const world = makeWorld();
    const id = ids(world)[0]!;
    roughGesture(world, id, 1400, 1, 0);

    const scheduler = new SystemScheduler().add(emotionSystem).add(idleSystem);
    for (let tick = 0; tick < 20 * 3; tick++) scheduler.update(world, 1 / 20);

    expect(world.store(Behavior).get(id)!.pose, 'parou de mostrar dor cedo demais').toBe(POSE.hurt);
  });

  it('a dor passa em minutos, mas a lembrança de quem bateu fica', () => {
    const world = makeWorld();
    const id = ids(world)[0]!;
    roughGesture(world, id, 1400, 1, 0);
    const emotions = world.store(Emotions).get(id)!;
    const memory = world.store(Memory).get(id)!;

    const scheduler = new SystemScheduler().add(emotionSystem).add(idleSystem);
    for (let tick = 0; tick < 20 * 180; tick++) scheduler.update(world, 1 / 20);

    expect(emotions.pain, 'a dor não passou').toBeLessThan(0.05);
    expect(emotions.trauma, 'o trauma sumiu junto com a dor').toBeGreaterThan(0.05);
    expect(memory.valenceOf(subjects.player()), 'esqueceu quem bateu').toBeLessThan(-0.2);
  });

  it('quem viu a cena passa a temer o jogador sem ter apanhado', () => {
    const world = makeWorld(6);
    const all = ids(world);
    const victim = all[0]!;
    const transforms = world.store(Transform);
    const spot = transforms.get(victim)!;

    // Uma testemunha ao lado, outra do outro lado do jardim.
    const near = all[1]!;
    const far = all[2]!;
    const nearTransform = transforms.get(near)!;
    nearTransform.x = spot.x + 20;
    nearTransform.y = spot.y + 20;
    const farTransform = transforms.get(far)!;
    farTransform.x = spot.x + world.store(Attributes).get(far)!.vision + 250;
    farTransform.y = spot.y;

    for (const entity of all) world.store(Emotions).get(entity)!.fear = 0;
    const nearMemory = world.store(Memory).get(near)!;
    const farMemory = world.store(Memory).get(far)!;

    roughGesture(world, victim, 1400, 1, 0);

    expect(world.store(Emotions).get(near)!.fear, 'quem viu não se assustou').toBeGreaterThan(0.1);
    expect(nearMemory.valenceOf(subjects.player()), 'quem viu não aprendeu nada').toBeLessThan(0);
    // Quem estava longe não tem como saber.
    expect(farMemory.valenceOf(subjects.player()), 'aprendeu de longe demais').toBe(0);
  });
});
