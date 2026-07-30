import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CreatureRenderBuffer, SystemScheduler } from '@engine';
import { INTENT_NAMES } from '@core';
import { createUtilityBrain } from '@ai';
import { Creature } from '@creatures';
import {
  ambientSystem,
  ballSystem,
  createWorld,
  dayNightSystem,
  itemSystem,
  plantGrowthSystem,
  plantSpreadSystem,
  propSystem,
  weatherSystem,
} from '@world';
import {
  spawnCreatures,
  writeCreatureBuffer,
  creatureIndexSystem,
  foodIndexSystem,
  decisionSystem,
  movementSystem,
  actionSystem,
  metabolismSystem,
  emotionSystem,
  eggSystem,
  reproductionSystem,
  searchSystem,
  idleSystem,
  BrainResource,
  PlayerResource,
} from '@simulation';
import { AnimationController } from '../rendering/anim/AnimationController';
import type { CreatureSignals } from '../rendering/anim/states';

/**
 * ELA PARECE VIVA?
 *
 * A pergunta veio do jogador, olhando a criatura na tela: *"não parece vivo, ele
 * fica em um loop de ? e fazendo coisas aleatoriamente ou em loop"*. Nenhum teste
 * pegava isso, porque nenhum teste olhava para o que aparece na TELA ao longo do
 * tempo — só para o estado escolhido num instante.
 *
 * Este é o teste da queixa, e ele precisa das duas metades do jogo: a simulação
 * decidindo o que a criatura quer, e a máquina de animação decidindo o que
 * desenhar. É por isso que ele vive na camada `app` — é a única que pode ver as
 * duas, e juntar as duas é justamente o que o jogador faz com os olhos.
 *
 * O que ele mede não é "o código está certo", é "isto parece um bicho":
 *
 *  - nenhum desenho fica na tela por muito tempo seguido — um laço só, parado,
 *    por meio minuto é o que faz um boneco;
 *  - nenhum desenho ocupa a maior parte da vida dela;
 *  - o repertório é largo: um bicho vivo faz muitas coisas diferentes.
 *
 * Os três números foram medidos antes de virarem limite, e este teste foi rodado
 * contra o código de antes para se provar. O resultado é o print que o jogador
 * mandou, em uma linha:
 *
 *     12 tiras diferentes · mais vista curioso 91% · 273s seguidos
 *
 * `curioso` é a tira que tem uma interrogação desenhada dentro. Ela ficou na tela
 * quatro minutos e meio de cinco, sem trocar uma vez. Depois: 38 tiras, a mais
 * vista com 19%, e nenhuma parada passando de nove segundos.
 */

const ANIMATIONS = fileURLToPath(new URL('../assets/creatures/animations', import.meta.url));

/** O catálogo como o jogo o vê: nome do meio do arquivo → número de quadros. */
function catalog(): Map<string, number> {
  const out = new Map<string, number>();
  for (const dir of readdirSync(ANIMATIONS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of readdirSync(`${ANIMATIONS}/${dir.name}`)) {
      const parts = file.split('--');
      const key = parts[1];
      const frames = Number(parts[2]?.replace(/frames\.png$/, ''));
      if (key && frames > 0) out.set(key, frames);
    }
  }
  return out;
}

const DT = 1 / 20;
const MINUTOS = 5;

/**
 * O JARDIM INTEIRO, como o jogo o roda.
 *
 * Com meia dúzia de sistemas de menos, a primeira versão deste teste media uma
 * criatura que morria de fome no meio da conta — as plantas não cresciam de
 * volta. Uma medida de "parece viva" feita num mundo onde ela está morrendo não
 * mede nada. É a mesma lista de `garden.test.ts`, mais a bola.
 */
const scheduler = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(eggSystem)
    .add(emotionSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(reproductionSystem)
    .add(metabolismSystem)
    .add(itemSystem)
    .add(ballSystem)
    .add(searchSystem)
    .add(weatherSystem)
    .add(dayNightSystem)
    .add(ambientSystem)
    .add(propSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);

/**
 * AS TIRAS EM QUE O CORPO JÁ ESTÁ ANDANDO.
 *
 * Ficam fora das duas medidas de "tempo demais na mesma tira", e não é
 * indulgência: a queixa do jogador é de POSE PARADA repetida. Um ciclo de passo
 * que dura quinze segundos é uma criatura atravessando o jardim — as pernas se
 * mexem, a cena muda porque o fundo muda. Quinze segundos do mesmo gesto de pé
 * no mesmo lugar é o boneco.
 */
const LOCOMOCAO = new Set(['caminhar', 'correr', 'nadar', 'flutuar', 'fugir', 'escalar']);

interface Medida {
  /** Quantos quadros de simulação a criatura foi vista. */
  vista: number;
  /** Quantas vezes cada tira apareceu. */
  tiras: Map<string, number>;
  /** O maior número de quadros SEGUIDOS com a mesma tira PARADA. */
  maiorSeguida: number;
  tiraTeimosa: string;
}

/** Roda o jardim e anota o que apareceu na tela de UMA criatura. */
function observar(seed: number): Medida {
  const frames = catalog();
  const world = createWorld({ width: 900, height: 900 }, seed);
  spawnCreatures(world, 20);
  world.setResource(BrainResource, createUtilityBrain());
  // O jogador presente: é assim que o jogador vê o jardim, e a mão dele muda o
  // que a criatura quer fazer.
  world.setResource(PlayerResource, { x: 450, y: 450, present: true });

  let quem = -1;
  world.store(Creature).forEach((_tag, entity) => {
    if (quem < 0) quem = entity;
  });

  const controller = new AnimationController({
    frameCount: (key) => frames.get(key) ?? 1,
    has: (key) => frames.has(key),
    // Sorteio do jardim, para a medida ser a mesma toda vez.
    random: () => world.rng.next(),
  });

  const run = scheduler();
  const buffer = new CreatureRenderBuffer(16);
  const medida: Medida = { vista: 0, tiras: new Map(), maiorSeguida: 0, tiraTeimosa: '' };
  let anterior = '';
  let seguida = 0;

  for (let tick = 0; tick < 20 * 60 * MINUTOS; tick++) {
    run.update(world, DT);
    writeCreatureBuffer(world, buffer);
    for (let i = 0; i < buffer.count; i++) {
      if (buffer.id[i] !== quem) continue;
      const signals: CreatureSignals = {
        intent: INTENT_NAMES[buffer.intent[i]!]!,
        pose: buffer.pose[i]!,
        mood: buffer.mood[i]!,
        moving: buffer.moving[i] === 1,
        speed: buffer.moving[i] === 1 ? 25 : 0,
        carrying: buffer.carrying[i] === 1,
        ball: buffer.ball[i] === 1,
        scar: buffer.scar[i]!,
        fear: buffer.fear[i]!,
        happiness: buffer.happiness[i]!,
        energy: buffer.energy[i]!,
        health: buffer.health[i]!,
        touched: false,
        carried: false,
        lift: 0,
        isBaby: buffer.stage[i] === 0,
        company: buffer.company[i]!,
        routine: buffer.routine[i]!,
      };
      controller.update(signals, DT);
      const tira = controller.clip ?? '';
      medida.vista += 1;
      medida.tiras.set(tira, (medida.tiras.get(tira) ?? 0) + 1);
      if (tira === anterior) {
        seguida += 1;
        if (seguida > medida.maiorSeguida && !LOCOMOCAO.has(tira)) {
          medida.maiorSeguida = seguida;
          medida.tiraTeimosa = tira;
        }
      } else {
        anterior = tira;
        seguida = 1;
      }
    }
  }
  return medida;
}

describe('a criatura parece viva', () => {
  it('nenhuma tira fica na tela demais, e o repertório é largo', () => {
    for (const seed of [3, 21, 404]) {
      const { vista, tiras, maiorSeguida, tiraTeimosa } = observar(seed);
      const segundos = maiorSeguida / 20;
      const ordenadas = [...tiras.entries()]
        .filter(([key]) => !LOCOMOCAO.has(key))
        .sort((a, b) => b[1] - a[1]);
      const [maisVista, quanto] = ordenadas[0]!;
      const fracao = quanto / vista;
      console.log(
        `seed ${seed}: ${(vista / 20).toFixed(0)}s vista · ${tiras.size} tiras diferentes · ` +
          `mais vista ${maisVista} ${(fracao * 100).toFixed(0)}% · ` +
          `mais teimosa ${tiraTeimosa} ${segundos.toFixed(0)}s seguidos`,
      );

      // Meio minuto de um desenho parado é o que fez o jogador dizer que ela não
      // parecia viva. Doze segundos ainda é uma criatura contemplando algo.
      expect(
        segundos,
        `${tiraTeimosa} ficou ${segundos.toFixed(0)}s seguidos na tela, parada`,
      ).toBeLessThan(12);
      // E nenhum gesto parado é a vida dela.
      expect(fracao, `${maisVista} ocupou ${(fracao * 100).toFixed(0)}% do tempo`).toBeLessThan(
        0.35,
      );
      // Um bicho vivo faz muitas coisas. Com o defeito, eram quinze.
      expect(tiras.size, 'o repertório de cinco minutos é curto').toBeGreaterThan(18);
    }
  });
});
