import { describe, it, expect } from 'vitest';
import { SystemScheduler } from '@engine';
import { createUtilityBrain } from '@ai';
import { Creature } from '@creatures';
import { createWorld } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { creatureIndexSystem } from './creatureIndex';
import { foodIndexSystem } from './foodIndex';
import { decisionSystem } from './systems/decisionSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';
import { WatchedResource, createWatched } from './watched';

/**
 * A CONTA QUE O CÉREBRO FAZ TEM DE CHEGAR A QUEM ESTÁ OLHANDO.
 *
 * O painel mostra as notas que cada opção tirou — é o que transforma "ela foi
 * para lá" em "ela foi para lá porque comer valia 0,71 e beber valia 0,68". Isso
 * só existe se três coisas casarem: a interface diz quem está sendo observado, o
 * cérebro devolve a lista quando pedem, e alguém guarda até a decisão seguinte.
 *
 * E tem de sair de graça para todo o resto do jardim: uma lista alocada por
 * decisão, por criatura, várias vezes por segundo, para ninguém ler, é o tipo de
 * custo que só aparece quando a população cresce.
 */
function jardim(seed = 7) {
  const world = createWorld({ width: 600, height: 600 }, seed);
  spawnCreatures(world, 6);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 300, y: 300, present: true });
  world.setResource(WatchedResource, createWatched());
  const run = new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(decisionSystem);
  return { world, run };
}

const primeira = (world: ReturnType<typeof jardim>['world']): number => {
  let id = -1;
  world.store(Creature).forEach((_tag, entity) => {
    if (id < 0) id = entity;
  });
  return id;
};

describe('a cabeça aberta', () => {
  it('quem está sendo olhado devolve as notas de cada opção', () => {
    const { world, run } = jardim();
    const alvo = primeira(world);
    world.getResource(WatchedResource)!.id = alvo;

    for (let t = 0; t < 60; t++) run.update(world, 1 / 20);

    const watched = world.getResource(WatchedResource)!;
    expect(watched.options.length, 'o cérebro não explicou nada').toBeGreaterThan(2);
    // Em ordem, da maior nota para a menor: é assim que o painel desenha.
    for (let i = 1; i < watched.options.length; i++) {
      expect(watched.options[i]!.score).toBeLessThanOrEqual(watched.options[i - 1]!.score);
    }
    // Uma intenção por linha: brincar com a bola, com um amigo e com a mão do
    // jogador são três opções `play`, e o painel mostra a melhor delas.
    const nomes = watched.options.map((o) => o.intent);
    expect(new Set(nomes).size, 'a mesma intenção apareceu duas vezes').toBe(nomes.length);
    console.log(
      'pensou:',
      watched.options.map((o) => `${o.intent} ${o.score.toFixed(2)}`).join(' · '),
    );
  });

  it('e ninguém mais paga por isso', () => {
    const { world, run } = jardim();
    // Sem alvo — é o estado normal do jogo, com o painel fechado.
    for (let t = 0; t < 60; t++) run.update(world, 1 / 20);
    expect(world.getResource(WatchedResource)!.options).toEqual([]);
  });

  it('e a conta é da criatura certa', () => {
    // Duas criaturas com fomes diferentes pensam coisas diferentes. Se o painel
    // mostrasse a conta de outra, isto passaria despercebido para sempre.
    const { world, run } = jardim(3);
    const ids: number[] = [];
    world.store(Creature).forEach((_t, e) => ids.push(e));
    const [a, b] = [ids[0]!, ids[1]!];

    world.getResource(WatchedResource)!.id = a;
    for (let t = 0; t < 60; t++) run.update(world, 1 / 20);
    const contaA = world.getResource(WatchedResource)!.options.map((o) => o.score);

    world.getResource(WatchedResource)!.id = b;
    world.getResource(WatchedResource)!.options = [];
    for (let t = 0; t < 60; t++) run.update(world, 1 / 20);
    const contaB = world.getResource(WatchedResource)!.options.map((o) => o.score);

    expect(contaB.length).toBeGreaterThan(2);
    expect(contaA).not.toEqual(contaB);
  });
});
