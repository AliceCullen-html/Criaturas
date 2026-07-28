import { describe, it, expect } from 'vitest';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Creature, Emotions, Mind, Needs, Personality } from '@creatures';
import { createWorld, Item, itemSystem, ballSystem, spawnBall } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { creatureIndexSystem } from './creatureIndex';
import { foodIndexSystem } from './foodIndex';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { metabolismSystem } from './systems/metabolismSystem';
import { emotionSystem } from './systems/emotionSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

const CONFIG = { width: 600, height: 600 };
const DT = 1 / 20;

/**
 * BRINCAR É UM APETITE, NÃO UM VÍCIO.
 *
 * Medido no jogo: a criatura ficava num canto empurrando a bola até a energia
 * acabar, esquecida do resto do mundo. A bola era a única coisa do jardim de
 * que ninguém se cansava — e um brinquedo do qual não se cansa não é um
 * brinquedo, é um buraco.
 */
function comBola(seed = 12): { world: World; id: number } {
  const world = createWorld(CONFIG, seed);
  spawnCreatures(world, 1);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  let id = -1;
  world.store(Creature).forEach((_tag, entity) => {
    if (id < 0) id = entity;
  });
  const needs = world.store(Needs).get(id)!;
  needs.hunger = 0.15;
  needs.thirst = 0.15;
  needs.energy = 1;
  needs.play = 1;
  world.store(Emotions).get(id)!.fear = 0;
  world.store(Personality).get(id)!.playfulness = 1;

  const here = world.store(Transform).get(id)!;
  spawnBall(world, here.x + 25, here.y + 10);
  return { world, id };
}

const scheduler = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(decisionSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(metabolismSystem)
    .add(emotionSystem)
    .add(itemSystem)
    .add(ballSystem);

describe('a bola no canto', () => {
  it('a criatura não fica presa empurrando a bola contra a parede do mundo', () => {
    const world = createWorld(CONFIG, 12);
    spawnCreatures(world, 1);
    world.setResource(BrainResource, createUtilityBrain());
    world.setResource(PlayerResource, { x: 0, y: 0, present: false });
    let id = -1;
    world.store(Creature).forEach((_tag, entity) => {
      if (id < 0) id = entity;
    });
    const needs = world.store(Needs).get(id)!;
    needs.hunger = 0.15;
    needs.thirst = 0.15;
    needs.energy = 1;
    needs.play = 1;
    world.store(Emotions).get(id)!.fear = 0;
    world.store(Personality).get(id)!.playfulness = 1;

    // A cena do print: bicho e bola encostados no canto do jardim.
    const here = world.store(Transform).get(id)!;
    here.x = 20;
    here.y = 20;
    const ball = spawnBall(world, 8, 8);

    const run = scheduler();
    const spot = world.store(Transform).get(ball)!;
    let longe = 0;
    for (let tick = 0; tick < 20 * 120; tick++) {
      run.update(world, DT);
      longe = Math.max(longe, Math.hypot(spot.x - 8, spot.y - 8));
    }
    // Em dois minutos a bola tem de ter saído do canto — senão o que existe
    // ali não é uma brincadeira, é uma criatura empurrando uma parede.
    expect(longe, `a bola andou ${longe.toFixed(0)}px em dois minutos`).toBeGreaterThan(60);
  });
});

describe('brincar cansa', () => {
  it('ela brinca, se satisfaz e vai fazer outra coisa', () => {
    const { world, id } = comBola();
    const run = scheduler();
    const needs = world.store(Needs).get(id)!;
    const mind = world.store(Mind).get(id)!;

    let brincando = 0;
    let maiorSeguida = 0;
    let seguida = 0;
    let vontadeMinima = 1;
    for (let tick = 0; tick < 20 * 300; tick++) {
      run.update(world, DT);
      vontadeMinima = Math.min(vontadeMinima, needs.play);
      if (mind.intent === 'play') {
        brincando += 1;
        seguida += 1;
        maiorSeguida = Math.max(maiorSeguida, seguida);
      } else {
        seguida = 0;
      }
    }

    const fracao = brincando / (20 * 300);
    console.log(
      `brincou em ${(fracao * 100).toFixed(0)}% do tempo · maior sessão ${(maiorSeguida / 20).toFixed(0)}s · vontade caiu a ${vontadeMinima.toFixed(2)}`,
    );
    // Cinco minutos de jardim com a bola do lado: ela brinca, mas não vive
    // disso. Antes desta medida a fração passava de 90%.
    expect(fracao, `passou ${(fracao * 100).toFixed(0)}% do tempo na bola`).toBeLessThan(0.6);
    // E nenhuma sessão dura para sempre: a vontade acaba e ela larga.
    expect(maiorSeguida / 20, `brincou ${(maiorSeguida / 20).toFixed(0)}s sem parar`).toBeLessThan(
      120,
    );
    // A vontade é GASTA na brincadeira e volta sozinha depois — por isso ela
    // procura a bola de novo mais tarde, em vez de largar o brinquedo de vez.
    expect(vontadeMinima, 'brincou e a vontade não gastou nada').toBeLessThan(1);
  });

  it('e não brinca até cair de cansaço', () => {
    const { world, id } = comBola();
    const run = scheduler();
    const needs = world.store(Needs).get(id)!;
    let minima = 1;
    for (let tick = 0; tick < 20 * 300; tick++) {
      run.update(world, DT);
      minima = Math.min(minima, needs.energy);
    }
    expect(minima, `chegou a ${(minima * 100).toFixed(0)}% de energia`).toBeGreaterThan(0.35);
  });

  it('mas com a vontade cheia ela vai atrás da bola', () => {
    const { world, id } = comBola();
    const run = scheduler();
    const mind = world.store(Mind).get(id)!;
    let brincou = false;
    for (let tick = 0; tick < 20 * 30 && !brincou; tick++) {
      run.update(world, DT);
      if (mind.intent === 'play') brincou = true;
    }
    expect(brincou, 'nem olhou para a bola').toBe(true);
  });

  it('cada brincadeira gasta um pedaço da vontade', () => {
    const { world, id } = comBola();
    const run = scheduler();
    const needs = world.store(Needs).get(id)!;
    const antes = needs.play;
    // Enquanto ela brinca, a bola é reposta ao lado dela: é a brincadeira sem
    // a corrida no meio, que é o que isola o gasto.
    const spot = world.store(Transform).get(id)!;
    const bola = world.store(Transform);
    let alvo = -1;
    for (let tick = 0; tick < 20 * 60; tick++) {
      run.update(world, DT);
      if (alvo < 0) {
        world.store(Item).forEach((item, entity) => {
          if (item.kind === 'ball' && alvo < 0) alvo = entity;
        });
      }
      if (alvo >= 0 && tick % 10 === 0) {
        const b = bola.get(alvo);
        if (b) {
          b.x = spot.x + 12;
          b.y = spot.y + 6;
        }
      }
    }
    expect(needs.play, `gastou ${(antes - needs.play).toFixed(2)} de vontade`).toBeLessThan(
      antes - 0.3,
    );
  });

  it('e uma criatura saciada passa direto', () => {
    const { world, id } = comBola();
    world.store(Needs).get(id)!.play = 0;
    const run = scheduler();
    const mind = world.store(Mind).get(id)!;
    let amostras = 0;
    for (let tick = 0; tick < 20 * 20; tick++) {
      run.update(world, DT);
      if (mind.intent === 'play') amostras += 1;
    }
    expect(amostras / (20 * 20)).toBeLessThan(0.25);
  });
});
