import { describe, it, expect } from 'vitest';
import { SystemScheduler, Transform, Velocity, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Carried, Creature, Emotions, Falling, Memory, Mind, Needs } from '@creatures';
import { createWorld } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { creatureIndexSystem } from './creatureIndex';
import { foodIndexSystem } from './foodIndex';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { carrySystem } from './systems/carrySystem';
import { emotionSystem } from './systems/emotionSystem';
import {
  CARRY_HEIGHT,
  CARRY_PATIENCE,
  dropCreature,
  liftCreature,
  moveCarried,
} from './handActions';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * O COLO.
 *
 * A mão do jogador podia afagar, empurrar e bater — mas não podia PEGAR. Uma
 * criatura era um bicho atrás de um vidro: dava para tocar e não dava para
 * tirar do lugar. O colo é a interação que faltava, e o que se cobra dela aqui
 * é que ela tenha as duas faces: quem é carregado com cuidado gosta, quem é
 * carregado demais se aflige, e quem é atirado se machuca.
 */

const CONFIG = { width: 600, height: 600 };

function makeWorld(seed = 11): World {
  const world = createWorld(CONFIG, seed);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

function someone(world: World): number {
  let id = -1;
  world.store(Creature).forEach((_tag, entity) => {
    if (id < 0) id = entity;
  });
  return id;
}

describe('a criatura no colo', () => {
  it('sai do chão e vai para onde a mão for', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);

    expect(liftCreature(world, id)).toBe(true);
    moveCarried(world, id, 300, 220);

    const spot = world.store(Transform).get(id)!;
    expect(Math.round(spot.x)).toBe(300);
    expect(Math.round(spot.y)).toBe(220);
  });

  it('e enquanto está no ar ela NÃO anda sozinha', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const scheduler = new SystemScheduler()
      .add(foodIndexSystem)
      .add(creatureIndexSystem)
      .add(decisionSystem)
      .add(carrySystem)
      .add(movementSystem);

    liftCreature(world, id);
    moveCarried(world, id, 300, 300);
    // A decisão continua rodando lá dentro: ela quer ir a algum lugar. O que
    // não pode é o corpo obedecer — os pés não estão no chão.
    for (let i = 0; i < 40; i++) scheduler.update(world, 1 / 20);

    const spot = world.store(Transform).get(id)!;
    expect(Math.round(spot.x), 'ela saiu andando pendurada na mão').toBe(300);
    expect(Math.round(spot.y)).toBe(300);
    const velocity = world.store(Velocity).get(id)!;
    expect(velocity.x).toBe(0);
    expect(velocity.y).toBe(0);
  });

  it('um colo curto, em quem confia, é carinho', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const emotions = world.store(Emotions).get(id)!;
    emotions.trust = 0.9;
    emotions.fear = 0.3;
    emotions.scar = 0;
    const antes = emotions.happiness;

    liftCreature(world, id);
    const scheduler = new SystemScheduler().add(carrySystem);
    for (let i = 0; i < 40; i++) scheduler.update(world, 1 / 20);
    dropCreature(world, id, 0, 0);

    expect(emotions.happiness).toBeGreaterThan(antes);
    expect(world.store(Carried).get(id)).toBeUndefined();
    expect(world.store(Memory).get(id)!.valenceOf('player')).toBeGreaterThan(0);
  });

  it('mas ficar pendurada tempo demais aflige qualquer um', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const emotions = world.store(Emotions).get(id)!;
    emotions.trust = 0.9;
    emotions.stress = 0;

    liftCreature(world, id);
    const scheduler = new SystemScheduler().add(carrySystem);
    const passos = Math.ceil((CARRY_PATIENCE + 20) * 20);
    for (let i = 0; i < passos; i++) scheduler.update(world, 1 / 20);

    expect(world.store(Carried).get(id)!.time).toBeGreaterThan(CARRY_PATIENCE);
    expect(emotions.stress, 'meio minuto pendurada e ela nem se incomodou').toBeGreaterThan(0.1);
  });

  it('e atirar não é largar: dói, assusta e fica na memória', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const emotions = world.store(Emotions).get(id)!;
    const needs = world.store(Needs).get(id)!;
    emotions.trust = 0.9;
    emotions.fear = 0;
    const saude = needs.health;

    liftCreature(world, id);
    dropCreature(world, id, 700, 0);

    expect(emotions.pain).toBeGreaterThan(0.3);
    expect(emotions.fear).toBeGreaterThan(0.3);
    expect(emotions.trauma).toBeGreaterThan(0);
    expect(needs.health).toBeLessThan(saude);
    expect(world.store(Memory).get(id)!.valenceOf('player')).toBeLessThan(0);
  });

  it('largada, ela volta a viver: anda de novo e continua o que fazia', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const scheduler = new SystemScheduler()
      .add(foodIndexSystem)
      .add(creatureIndexSystem)
      .add(decisionSystem)
      .add(carrySystem)
      .add(movementSystem);

    liftCreature(world, id);
    moveCarried(world, id, 200, 200);
    for (let i = 0; i < 10; i++) scheduler.update(world, 1 / 20);
    dropCreature(world, id, 0, 0);

    const antes = { ...world.store(Transform).get(id)! };
    for (let i = 0; i < 120; i++) scheduler.update(world, 1 / 20);
    const agora = world.store(Transform).get(id)!;
    expect(Math.hypot(agora.x - antes.x, agora.y - antes.y)).toBeGreaterThan(1);
    expect(world.store(Mind).get(id)!.intent.length).toBeGreaterThan(0);
  });

  it('sobe para a mão em vez de aparecer erguida, e cai de onde estava', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const scheduler = new SystemScheduler().add(carrySystem);

    liftCreature(world, id);
    moveCarried(world, id, 200, 200);
    // Um instante de colo para ela terminar de subir até a mão.
    for (let i = 0; i < 20; i++) scheduler.update(world, 1 / 20);
    const alturaNoColo = world.store(Carried).get(id)!.z;
    expect(alturaNoColo, 'ela apareceu erguida em vez de subir').toBeGreaterThan(
      CARRY_HEIGHT * 0.9,
    );

    dropCreature(world, id, 0, 0);
    const queda = world.store(Falling).get(id);
    expect(queda, 'ela foi teleportada para o chão').toBeTruthy();
    // Cai de onde estava: sem salto entre o colo e a queda.
    expect(queda!.z).toBe(alturaNoColo);

    // A descida leva alguns passos, e passa por alturas intermediárias.
    const alturas: number[] = [];
    for (let i = 0; i < 30 && world.store(Falling).get(id); i++) {
      scheduler.update(world, 1 / 20);
      const agora = world.store(Falling).get(id);
      if (agora) alturas.push(agora.z);
    }
    expect(alturas.length, 'caiu num quadro só').toBeGreaterThan(2);
    expect(alturas[0]!).toBeLessThan(CARRY_HEIGHT);
    expect(world.store(Falling).get(id), 'ficou pendurada no ar').toBeUndefined();
  });

  it('e sacudir no ar não é carregar: ela se estressa e passa a desconfiar', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const emotions = world.store(Emotions).get(id)!;
    emotions.stress = 0;
    emotions.fear = 0;
    const confiava = emotions.trust;
    const scheduler = new SystemScheduler().add(carrySystem);

    liftCreature(world, id);
    // A mão indo e voltando depressa, que é o que é chacoalhar.
    for (let i = 0; i < 40; i++) {
      moveCarried(world, id, 200 + (i % 2 === 0 ? 90 : -90), 200);
      scheduler.update(world, 1 / 20);
    }

    expect(world.store(Carried).get(id)!.shaken).toBeGreaterThan(0.4);
    expect(emotions.stress, 'chacoalharam e ela nem percebeu').toBeGreaterThan(0.2);
    expect(emotions.fear).toBeGreaterThan(0.1);
    expect(emotions.trust).toBeLessThan(confiava);
    expect(world.store(Memory).get(id)!.valenceOf('player')).toBeLessThan(0);
  });

  it('mas levar a criatura de um lugar a outro, com calma, não a chacoalha', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const emotions = world.store(Emotions).get(id)!;
    emotions.stress = 0;
    const scheduler = new SystemScheduler().add(carrySystem);

    liftCreature(world, id);
    for (let i = 0; i < 40; i++) {
      moveCarried(world, id, 200 + i * 2, 200 + i);
      scheduler.update(world, 1 / 20);
    }

    expect(world.store(Carried).get(id)!.shaken).toBeLessThan(0.45);
    expect(emotions.stress, 'uma caminhada com ela no colo virou maus-tratos').toBeLessThan(0.1);
  });

  it('sacudir aflige, mas não condena a criatura a viver com medo', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const emotions = world.store(Emotions).get(id)!;
    emotions.fear = 0.1;
    emotions.trauma = 0;
    const noColo = new SystemScheduler().add(carrySystem);
    const vivendo = new SystemScheduler().add(emotionSystem).add(carrySystem);

    // Três segundos de chacoalho — o que o jogador faz para ver a animação.
    liftCreature(world, id);
    for (let i = 0; i < 60; i++) {
      moveCarried(world, id, 200 + (i % 2 === 0 ? 90 : -90), 200);
      noColo.update(world, 1 / 20);
    }
    const assustada = emotions.fear;
    expect(assustada, 'sacudiram e ela não se importou').toBeGreaterThan(0.25);
    expect(assustada, 'um chacoalhão a jogou no pavor de fuga').toBeLessThan(0.55);

    dropCreature(world, id, 0, 0);
    // Meio minuto de paz depois: ela tem de estar de volta ao normal.
    for (let i = 0; i < 30 * 20; i++) vivendo.update(world, 1 / 20);
    expect(emotions.fear, 'meio minuto depois e ela ainda vive apavorada').toBeLessThan(0.2);
  });

  it('mas sacudir SEMPRE deixa marca: o trauma é o que se acumula', () => {
    const world = makeWorld();
    spawnCreatures(world, 1);
    const id = someone(world);
    const emotions = world.store(Emotions).get(id)!;
    emotions.trauma = 0;
    const noColo = new SystemScheduler().add(carrySystem);

    for (let volta = 0; volta < 4; volta++) {
      liftCreature(world, id);
      for (let i = 0; i < 100; i++) {
        moveCarried(world, id, 200 + (i % 2 === 0 ? 90 : -90), 200);
        noColo.update(world, 1 / 20);
      }
      dropCreature(world, id, 0, 0);
    }
    expect(emotions.trauma, 'chacoalharam vinte segundos e não sobrou nada').toBeGreaterThan(0.25);
  });
});
