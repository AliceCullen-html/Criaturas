import { describe, it, expect } from 'vitest';
import { SystemScheduler } from '@engine';
import { createUtilityBrain } from '@ai';
import { Creature, Habits, Needs } from '@creatures';
import { INTENT } from '@core';
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
import { creatureIndexSystem } from './creatureIndex';
import { foodIndexSystem } from './foodIndex';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { metabolismSystem } from './systems/metabolismSystem';
import { emotionSystem } from './systems/emotionSystem';
import { idleSystem } from './systems/idleSystem';
import { rewardSystem } from './systems/rewardSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * A VIDA ENSINA, E ENSINA DIFERENTE PARA CADA UMA.
 *
 * O pedido é comportamento emergente: nada de "formar amizade", "colecionar
 * flores" ou "proteger filhote" escritos à mão. O que este arquivo cobra é a
 * peça que torna isso possível — que a criatura mude por causa do que viveu, e
 * não por causa do que alguém escreveu sobre ela.
 *
 * Nenhum destes testes sabe o que é comida. Eles olham só para a experiência
 * dela: o que subiu, o que desceu, e se duas criaturas que viveram vidas
 * diferentes ficaram diferentes.
 */

const DT = 1 / 20;

function jardim(seed: number, quantas = 2) {
  const world = createWorld({ width: 800, height: 800 }, seed);
  spawnCreatures(world, quantas);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  const run = new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(emotionSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(metabolismSystem)
    .add(rewardSystem)
    .add(itemSystem)
    .add(weatherSystem)
    .add(dayNightSystem)
    .add(ambientSystem)
    .add(propSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);
  return { world, run };
}

const ids = (world: ReturnType<typeof jardim>['world']): number[] => {
  const out: number[] = [];
  world.store(Creature).forEach((_tag, entity) => out.push(entity));
  return out;
};

describe('o que a vida ensinou a ela', () => {
  it('uma criatura que vive um pouco passa a ter opinião sobre o que faz', () => {
    const { world, run } = jardim(5);
    const quem = ids(world)[0]!;
    for (let t = 0; t < 20 * 240; t++) run.update(world, DT);

    const habit = world.store(Habits).get(quem)!;
    const julgadas = habit.tries.filter((n) => n > 0).length;
    const opinioes = habit.value.filter(
      (v, i) => (habit.tries[i] ?? 0) > 0 && Math.abs(v - 0.5) > 0.02,
    );
    console.log(
      `julgou ${julgadas} intenções · ${opinioes.length} com opinião formada · ` +
        habit.value
          .map((v, i) => ((habit.tries[i] ?? 0) > 0 ? `${i}:${v.toFixed(2)}` : ''))
          .filter(Boolean)
          .join(' '),
    );

    expect(julgadas, 'ela viveu quatro minutos e não julgou nada').toBeGreaterThan(2);
    // E as opiniões não podem ser todas iguais a 0,5: isso seria uma criatura
    // que viveu sem que nada lhe acontecesse.
    expect(opinioes.length, 'viveu, mas não formou opinião sobre nada').toBeGreaterThan(1);
  });

  it('e duas criaturas iguais, com vidas diferentes, ficam diferentes', () => {
    // O MESMO GENOMA NÃO BASTA PARA SER A MESMA PESSOA. É este o teste que
    // justifica o sistema inteiro: antes dele, duas irmãs de genes idênticos
    // decidiam igual a vida toda, porque a conta da utilidade era a mesma conta.
    const { world, run } = jardim(9, 6);
    for (let t = 0; t < 20 * 300; t++) run.update(world, DT);

    const habits = world.store(Habits);
    const vivas = ids(world).filter((id) => habits.has(id));
    expect(vivas.length, 'não sobrou gente para comparar').toBeGreaterThan(1);

    // A maior diferença de opinião entre duas criaturas, na mesma intenção.
    let maior = 0;
    let onde = '';
    for (let i = 0; i < vivas.length; i++) {
      for (let j = i + 1; j < vivas.length; j++) {
        const a = habits.get(vivas[i]!)!;
        const b = habits.get(vivas[j]!)!;
        for (let k = 0; k < a.value.length; k++) {
          if ((a.tries[k] ?? 0) === 0 || (b.tries[k] ?? 0) === 0) continue;
          const d = Math.abs((a.value[k] ?? 0.5) - (b.value[k] ?? 0.5));
          if (d > maior) {
            maior = d;
            onde = `intenção ${k}: ${(a.value[k] ?? 0).toFixed(2)} contra ${(b.value[k] ?? 0).toFixed(2)}`;
          }
        }
      }
    }
    console.log(`maior divergência entre duas criaturas — ${onde}`);
    expect(maior, 'todas aprenderam exatamente a mesma coisa').toBeGreaterThan(0.08);
  });

  it('o que dá certo sobe e o que dá errado desce, sem ninguém dizer qual é qual', () => {
    // Nada aqui nomeia comer. Duas criaturas, uma com fome e outra saciada,
    // vivem o mesmo jardim — e a experiência delas com `seekFood` diverge
    // sozinha, porque para uma a busca termina em comida e para a outra não
    // começa. É o sistema descobrindo o que o jogo quer dizer com "bom".
    const { world, run } = jardim(17, 4);
    const todas = ids(world);
    const faminta = todas[0]!;
    world.store(Needs).get(faminta)!.hunger = 0.85;

    for (let t = 0; t < 20 * 200; t++) run.update(world, DT);

    const habit = world.store(Habits).get(faminta);
    if (!habit) return; // morreu de fome: o jardim é duro, e isso não é falha do teste
    const comer = habit.value[INTENT.seekFood] ?? 0.5;
    const tentou = habit.tries[INTENT.seekFood] ?? 0;
    const fome = world.store(Needs).get(faminta)!.hunger;
    console.log(
      `procurou comida ${tentou} vezes · opinião ${comer.toFixed(2)} · fome final ${fome.toFixed(2)}`,
    );
    expect(tentou, 'com fome de 0,85 ela nunca procurou comida').toBeGreaterThan(0);
    // Se ela conseguiu matar a fome, procurar comida tem de ter subido.
    if (fome < 0.5) {
      expect(comer, 'comeu e não aprendeu que procurar comida vale a pena').toBeGreaterThan(0.5);
    }
  });

  it('e o capricho do momento dura — não é um tremor a cada instante', () => {
    // Um ruído sorteado a cada reavaliação desfaz qualquer objetivo que leve
    // tempo: numa caminhada de um minuto são umas quinze reavaliações, e basta
    // uma virar. Este teste cobra que a inclinação dela seja a MESMA por um
    // tempo, que é o que a deixa chegar aonde estava indo.
    const { world, run } = jardim(23, 3);
    const quem = ids(world)[0]!;
    const habits = world.store(Habits);

    let trocas = 0;
    let anterior = habits.get(quem)!.whim;
    for (let t = 0; t < 20 * 120; t++) {
      run.update(world, DT);
      const agora = habits.get(quem)?.whim;
      if (agora === undefined) break;
      if (agora !== anterior) {
        trocas += 1;
        anterior = agora;
      }
    }
    console.log(`o capricho mudou ${trocas} vezes em dois minutos`);
    // Dois minutos, capricho de dezoito segundos: umas seis ou sete trocas.
    // Muito mais que isso e ele voltou a ser tremor.
    expect(trocas).toBeGreaterThan(2);
    expect(trocas, 'o capricho está mudando depressa demais para durar uma travessia').toBeLessThan(
      12,
    );
  });
});
