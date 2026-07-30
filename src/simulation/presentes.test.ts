import { describe, it, expect } from 'vitest';
import { SystemScheduler } from '@engine';
import { createUtilityBrain } from '@ai';
import {
  ambientSystem,
  ballSystem,
  createWorld,
  dayNightSystem,
  Item,
  itemSystem,
  loose,
  maxItems,
  plantGrowthSystem,
  plantSpreadSystem,
  propSystem,
  weatherSystem,
} from '@world';
import { spawnCreatures } from './spawnCreatures';
import { creatureIndexSystem } from './creatureIndex';
import { foodIndexSystem } from './foodIndex';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { metabolismSystem } from './systems/metabolismSystem';
import { emotionSystem } from './systems/emotionSystem';
import { eggSystem } from './systems/eggSystem';
import { idleSystem } from './systems/idleSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';
import { placeGift, placeBall } from './toolActions';

/**
 * O QUE O JOGADOR LARGA NÃO PERDE VAGA PARA FRUTA CAÍDA.
 *
 * O jogador viu isto antes de mim: dar presente simplesmente não funcionava —
 * às vezes. Medido, a explicação: o jardim vive encostado no teto de objetos
 * (57 de 57 num jardim comum), porque as árvores frutificam o tempo todo, e o
 * presente disputava vaga com fruta no chão. Quando perdia, o jogo piscava uma
 * interrogaçãozinha e nada mais acontecia — um gesto que falha em silêncio é
 * pior do que um gesto que não existe.
 *
 * Um gesto do jogador não pode perder para o cenário se acumulando. Bola e
 * presente têm cota própria, pequena, e por isso ficam fora do teto do jardim.
 */

const DT = 1 / 20;

function jardimCheio(seed = 1337, minutos = 10) {
  const world = createWorld({ width: 900, height: 900 }, seed);
  spawnCreatures(world, 1, { asEgg: true, ageFraction: 0.05 });
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  const run = new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(eggSystem)
    .add(emotionSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(metabolismSystem)
    .add(itemSystem)
    .add(ballSystem)
    .add(weatherSystem)
    .add(dayNightSystem)
    .add(ambientSystem)
    .add(propSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);
  for (let t = 0; t < 20 * 60 * minutos; t++) run.update(world, DT);
  return world;
}

describe('presentes', () => {
  it('num jardim já cheio de fruta, dar presente continua funcionando', () => {
    const world = jardimCheio();
    const soltos = loose(world);
    const teto = maxItems(world.config);
    console.log(`jardim com ${soltos} objetos soltos de um teto de ${teto}`);

    // Seis presentes seguidos, que é a cota — todos têm de entrar.
    const aceitos: number[] = [];
    for (let i = 0; i < 6; i++) aceitos.push(placeGift(world, 400 + i * 15, 400));
    expect(
      aceitos.every((id) => id >= 0),
      `um presente foi recusado num jardim com ${soltos}/${teto} objetos`,
    ).toBe(true);

    // E o sétimo não: a cota existe para o jardim não virar depósito.
    expect(placeGift(world, 500, 500), 'o sétimo presente entrou — a cota não vale').toBeLessThan(
      0,
    );
  });

  it('e a bola também, pela mesma razão', () => {
    const world = jardimCheio(21, 8);
    expect(placeBall(world, 400, 400)).toBe('placed');
    expect(placeBall(world, 430, 400)).toBe('placed');
    expect(placeBall(world, 460, 400)).toBe('placed');
    expect(placeBall(world, 490, 400), 'a quarta bola entrou — a cota não vale').toBe('full');
  });

  it('o que o jogador larga sai da conta do jardim', () => {
    // A regra que sustenta as duas coisas acima: o teto conta o que o JARDIM
    // produz, não o que a mão do jogador põe lá.
    const world = createWorld({ width: 900, height: 900 }, 5);
    const todos = (): number => {
      let n = 0;
      world.store(Item).forEach(() => (n += 1));
      return n;
    };
    const contavamAntes = loose(world);
    const existiamAntes = todos();
    placeBall(world, 300, 300);
    placeGift(world, 320, 300);
    placeGift(world, 340, 300);
    expect(loose(world), 'a bola e os presentes tomaram vaga da fruta').toBe(contavamAntes);
    // Mas continuam existindo no mundo, claro.
    expect(todos(), 'a bola e os presentes nem chegaram a existir').toBe(existiamAntes + 3);
  });
});
