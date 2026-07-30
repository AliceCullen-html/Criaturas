import { describe, it, expect } from 'vitest';
import { subjects } from '@core';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Bond, Creature, Emotions, Memory, Mind, Nest } from '@creatures';
import {
  ambientSystem,
  createWorld,
  dayNightSystem,
  itemSystem,
  plantGrowthSystem,
  plantSpreadSystem,
  propSystem,
  weatherSystem,
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
import { eggSystem } from './systems/eggSystem';
import { searchSystem } from './systems/searchSystem';
import { idleSystem } from './systems/idleSystem';
import { confinementSystem } from './systems/confinementSystem';
import { planSystem } from './systems/planSystem';
import { socialSystem, DeathsResource } from './systems/socialSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * VIDA SOCIAL.
 *
 * O que se cobra aqui não é que os laços EXISTAM — isso é só um número na
 * memória —, é que eles apareçam no comportamento. Uma amizade que ninguém
 * consegue ver de fora não é uma amizade: é um campo de dados.
 *
 * Por isso os testes medem o que dá para OLHAR: com quem ela anda, onde ela
 * dorme, e o que acontece com quem fica quando alguém morre.
 */

const WORLD = { width: 900, height: 900 };
const DT = 1 / 20;
const CREATURES = 24;

function garden(seed: number): World {
  const world = createWorld(WORLD, seed);
  spawnCreatures(world, CREATURES);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  world.setResource(DeathsResource, []);
  return world;
}

const scheduler = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(eggSystem)
    .add(emotionSystem)
    .add(socialSystem)
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

const run = (world: World, minutes: number, each?: (tick: number) => void): void => {
  const sched = scheduler();
  for (let tick = 0; tick < 20 * 60 * minutes; tick++) {
    sched.update(world, DT);
    each?.(tick);
  }
};

describe('vida social', () => {
  it('em vinte minutos de jardim, nascem amizades — e elas duram', () => {
    const world = garden(1337);

    // Amizades vistas ao longo do tempo, e as que sobreviveram até o fim.
    const everSeen = new Set<string>();
    run(world, 20, (tick) => {
      if (tick % 200 !== 0) return;
      world.store(Bond).forEach((bond, entity) => {
        if (bond.friend >= 0 && bond.friendship > 0.25) {
          everSeen.add([entity, bond.friend].sort((a, b) => a - b).join('-'));
        }
      });
    });

    let comAmiga = 0;
    let reciprocas = 0;
    const bonds = world.store(Bond);
    bonds.forEach((bond, entity) => {
      if (bond.friend < 0 || bond.friendship <= 0.25) return;
      comAmiga += 1;
      const deles = bonds.get(bond.friend);
      if (deles?.friend === entity) reciprocas += 1;
    });

    const vivas = world.store(Creature).size;
    console.log(
      `${vivas} criaturas · ${comAmiga} com melhor amiga · ${reciprocas / 2} amizades recíprocas · ` +
        `${everSeen.size} pares ao longo do tempo`,
    );

    expect(comAmiga, 'ninguém fez amizade em vinte minutos').toBeGreaterThan(vivas * 0.4);
    // Recíproca é o teste duro: as duas elegeram uma à outra.
    expect(reciprocas, 'nenhuma amizade correspondida').toBeGreaterThan(0);
  });

  it('elas dormem em casa, e as casas das amigas ficam vizinhas', () => {
    const world = garden(7);

    // A MEDIDA É UMA COMPARAÇÃO, e não um número.
    //
    // Antes isto cobrava "dorme no próprio ninho em mais de metade das
    // amostras". Medindo em quatro jardins, a mesma conta dá 45%, 51%, 52% e
    // 54% — a régua estava exatamente em cima da média, e uma das sementes já
    // reprovava. Uma medida com quinze pontos de variação e um limite no meio
    // dela não testa comportamento: testa sorte.
    //
    // O que a pergunta quer saber é se o NINHO significa alguma coisa. Isso se
    // responde comparando: ela dorme mais perto da própria casa do que da casa
    // da vizinha? Aí a variação do mundo cai fora dos dois lados da conta, e o
    // que sobra é o efeito.
    let somaPropria = 0;
    let somaAlheia = 0;
    let amostras = 0;
    run(world, 20, (tick) => {
      if (tick % 40 !== 0) return;
      const minds = world.store(Mind);
      const nests = world.store(Nest);
      const transforms = world.store(Transform);
      minds.forEach((mind, entity) => {
        if (mind.intent !== 'sleep') return;
        const nest = nests.get(entity);
        const here = transforms.get(entity);
        if (!nest || !here || nest.attachment <= 0.15) return;
        // O CONTROLE É UMA PERMUTAÇÃO: a distância dela até a casa DE OUTRA,
        // na média. Comparar com a casa vizinha MAIS PRÓXIMA não serviria — os
        // ninhos das amigas ficam a setenta pixels um do outro, então essa
        // conta seria quase cara ou coroa por construção, e mediria o
        // agrupamento das famílias em vez do apego à própria casa.
        let soma = 0;
        let quantas = 0;
        nests.forEach((outro, quem) => {
          if (quem === entity || outro.attachment <= 0.15) return;
          soma += Math.hypot(here.x - outro.x, here.y - outro.y);
          quantas += 1;
        });
        if (quantas === 0) return;
        amostras += 1;
        somaPropria += Math.hypot(here.x - nest.x, here.y - nest.y);
        somaAlheia += soma / quantas;
      });
    });

    // Ninhos de amigas: perto um do outro, comparados com um par qualquer.
    const nests = world.store(Nest);
    const bonds = world.store(Bond);
    const entreAmigas: number[] = [];
    const todos: Array<{ x: number; y: number }> = [];
    nests.forEach((nest) => todos.push({ x: nest.x, y: nest.y }));
    bonds.forEach((bond, entity) => {
      if (bond.friend < 0 || bond.friendship <= 0.3) return;
      const mine = nests.get(entity);
      const theirs = nests.get(bond.friend);
      if (mine && theirs) entreAmigas.push(Math.hypot(mine.x - theirs.x, mine.y - theirs.y));
    });

    let somaQualquer = 0;
    let pares = 0;
    for (let i = 0; i < todos.length; i++) {
      for (let j = i + 1; j < todos.length; j++) {
        somaQualquer += Math.hypot(todos[i]!.x - todos[j]!.x, todos[i]!.y - todos[j]!.y);
        pares += 1;
      }
    }
    const mediaQualquer = pares > 0 ? somaQualquer / pares : 0;
    const mediaAmigas =
      entreAmigas.length > 0 ? entreAmigas.reduce((a, b) => a + b, 0) / entreAmigas.length : 0;

    const propria = somaPropria / Math.max(1, amostras);
    const alheia = somaAlheia / Math.max(1, amostras);
    console.log(
      `dorme a ${propria.toFixed(0)}px da própria casa e a ${alheia.toFixed(0)}px de uma casa ` +
        `qualquer · ninhos de amigas a ${mediaAmigas.toFixed(0)}px, ` +
        `dupla qualquer a ${mediaQualquer.toFixed(0)}px`,
    );

    expect(amostras, 'ninguém dormiu em vinte minutos').toBeGreaterThan(20);
    // Metade da distância, no mínimo. Se o ninho não significasse nada, dormir
    // seria em qualquer lugar e as duas contas dariam o mesmo — é contra essa
    // igualdade que a régua está, e não contra um valor colhido de um mundo só.
    expect(
      propria,
      'o ninho não serve para nada — ela dorme tão longe da própria casa quanto de uma qualquer',
    ).toBeLessThan(alheia * 0.5);
    expect(entreAmigas.length, 'nenhum par de amigas com ninho').toBeGreaterThan(0);
    // A prova de que a família se junta: bem mais perto que a média do jardim.
    expect(mediaAmigas, 'ninhos de amigas não ficam mais perto que o acaso').toBeLessThan(
      mediaQualquer * 0.5,
    );
  });

  it('quando uma morre, quem gostava dela sente — e guarda a lembrança', () => {
    const world = garden(99);
    run(world, 3);

    // Escolhe uma criatura querida e mata-a.
    const bonds = world.store(Bond);
    let vitima = -1;
    bonds.forEach((bond) => {
      if (vitima < 0 && bond.friend >= 0 && bond.friendship > 0.25) vitima = bond.friend;
    });
    expect(vitima, 'ninguém tinha amiga para perder').toBeGreaterThanOrEqual(0);

    // QUEM SENTE É QUEM ESTÁ VIVO E FORA DA CASCA.
    //
    // A varredura era pela memória, e memória um OVO também tem: ele herda
    // parte do que os pais sabiam, inclusive a opinião sobre quem morreu. Só
    // que ovo não sente falta de ninguém — ele nem é criatura ainda, e é por
    // isso que nenhum sistema do jogo o enxerga. O teste enxergava, e cobrava
    // luto de uma casca.
    const enlutados: number[] = [];
    world.store(Memory).forEach((memory, entity) => {
      if (entity === vitima || !world.store(Creature).get(entity)) return;
      if (memory.valenceOf(subjects.creature(vitima)) > 0.12) enlutados.push(entity);
    });
    const antes = enlutados.map((id) => world.store(Emotions).get(id)!.happiness);

    world.getResource(DeathsResource).push(vitima);
    world.destroyEntity(vitima);
    scheduler().update(world, DT);

    let ficaramTristes = 0;
    let comLembranca = 0;
    enlutados.forEach((id, i) => {
      const agora = world.store(Emotions).get(id);
      if (agora && agora.happiness < antes[i]!) ficaramTristes += 1;
      const memory = world.store(Memory).get(id);
      if (memory?.episodes.some((e) => e.emotion === 'luto')) comLembranca += 1;
    });

    console.log(
      `${enlutados.length} criaturas gostavam dela · ${ficaramTristes} ficaram tristes · ` +
        `${comLembranca} guardaram a lembrança`,
    );
    expect(enlutados.length, 'ninguém gostava dela').toBeGreaterThan(0);
    expect(ficaramTristes, 'a morte não afetou ninguém').toBe(enlutados.length);
    expect(comLembranca, 'ninguém guardou a lembrança').toBeGreaterThan(0);
  });
});
