import { describe, it, expect } from 'vitest';
import { CreatureRenderBuffer, SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Creature, Emotions, Memory, Mind, Needs, Personality } from '@creatures';
import { INTENT, subjects } from '@core';
import { createWorld, Item, itemSystem, ballSystem, spawnBall, spawnGift, VARIANT } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { writeCreatureBuffer } from './creatureRender';
import { creatureIndexSystem } from './creatureIndex';
import { foodIndexSystem } from './foodIndex';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { metabolismSystem } from './systems/metabolismSystem';
import { emotionSystem } from './systems/emotionSystem';
import { offerItem } from './handActions';
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

describe('a bola oferecida na mão', () => {
  /**
   * A BOLA NÃO SE COME.
   *
   * Encostar a bola na criatura fazia a bola SUMIR: tudo que não fosse
   * brinquedo caía no caminho da comida, e o caminho da comida termina em
   * destruir o objeto. Valia para a bola, para os presentes e para as
   * bugigangas do chão — ofereceu, engoliu.
   */
  it('encostada na criatura, a bola continua existindo', () => {
    const { world, id } = comBola();
    let bola = -1;
    world.store(Item).forEach((item, entity) => {
      if (item.kind === 'ball') bola = entity;
    });
    const spot = world.store(Transform).get(id)!;
    const onde = world.store(Transform).get(bola)!;
    onde.x = spot.x + 6;
    onde.y = spot.y + 6;

    expect(offerItem(world, bola, id), 'ela nem reparou na bola').toBe(true);
    expect(world.store(Item).has(bola), 'a criatura COMEU a bola').toBe(true);
    // E ficou com vontade de brincar: mostrar o brinquedo é um convite.
    expect(world.store(Needs).get(id)!.play).toBeGreaterThan(0.9);
  });

  /**
   * BRINCAR SEM BOLA NÃO É BRINCAR COM A BOLA.
   *
   * A intenção `play` cobre quatro brincadeiras — a bola largada no chão, um
   * amigo por perto, a mão do jogador e a chuva — e o desenho de brincar traz
   * uma bola dentro. Um filhote recém-saído do ovo, num jardim onde ninguém
   * jogou bola nenhuma, aparecia chutando uma. O canal `ball` do buffer é a
   * resposta da simulação a essa pergunta, e este teste mede a resposta com o
   * jardim rodando, não com um objeto montado à mão.
   */
  it('num jardim sem bola, ela brinca mas o buffer nunca pede a bola', () => {
    const world = createWorld(CONFIG, 5);
    spawnCreatures(world, 6);
    world.setResource(BrainResource, createUtilityBrain());
    // O jogador presente é uma das brincadeiras SEM bola — é a do print.
    world.setResource(PlayerResource, { x: 300, y: 300, present: true });
    world.store(Personality).forEach((traits) => (traits.playfulness = 1));
    world.store(Needs).forEach((needs) => {
      needs.play = 1;
      needs.hunger = 0.1;
      needs.thirst = 0.1;
    });

    const run = scheduler();
    const buffer = new CreatureRenderBuffer(64);
    let brincou = 0;
    let comBolaNoDesenho = 0;
    for (let tick = 0; tick < 20 * 120; tick++) {
      run.update(world, DT);
      writeCreatureBuffer(world, buffer);
      for (let i = 0; i < buffer.count; i++) {
        if (buffer.intent[i] === INTENT.play) brincou += 1;
        if (buffer.ball[i] === 1) comBolaNoDesenho += 1;
      }
    }

    console.log(`brincou em ${brincou} quadros de criatura, com bola em ${comBolaNoDesenho}`);
    // Que ela tenha brincado é o que dá sentido à outra medida: sem isto, o
    // teste passaria num jardim onde ninguém brincou.
    expect(brincou, 'ninguém brincou em dois minutos — o teste não provou nada').toBeGreaterThan(0);
    expect(comBolaNoDesenho, 'o desenho pediu uma bola que não existe no jardim').toBe(0);
  });

  it('e com a bola no chão o canal acende', () => {
    // A outra metade: um canal que responde "não" para tudo também passaria no
    // teste de cima, e não serviria para nada.
    const { world } = comBola();
    const run = scheduler();
    const buffer = new CreatureRenderBuffer(8);
    let acendeu = 0;
    for (let tick = 0; tick < 20 * 60; tick++) {
      run.update(world, DT);
      writeCreatureBuffer(world, buffer);
      for (let i = 0; i < buffer.count; i++) if (buffer.ball[i] === 1) acendeu += 1;
    }
    expect(acendeu, 'com a bola do lado, o desenho nunca soube dela').toBeGreaterThan(0);
  });

  it('e um presente também fica — e vira gosto', () => {
    const { world, id } = comBola();
    const spot = world.store(Transform).get(id)!;
    const presente = spawnGift(world, spot.x + 6, spot.y + 6, VARIANT.bear);
    world.store(Needs).get(id)!.hunger = 0.9; // com fome, para provar que não come

    expect(offerItem(world, presente, id)).toBe(true);
    expect(world.store(Item).has(presente), 'a criatura comeu o ursinho').toBe(true);
    expect(world.store(Memory).get(id)!.valenceOf(subjects.thing(VARIANT.bear))).toBeGreaterThan(0);
  });
});

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
