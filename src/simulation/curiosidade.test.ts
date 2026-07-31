import { describe, it, expect } from 'vitest';
import { subjects } from '@core';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Creature, Emotions, Memory, Mind, Needs, Personality } from '@creatures';
import { createWorld } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { creatureIndexSystem } from './creatureIndex';
import { emotionSystem } from './systems/emotionSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * O MAPA DELA, E A VONTADE DE SAIR DELE.
 *
 * A curiosidade era um espelho do temperamento: um valor que perseguia o gene e
 * ficava lá a vida inteira. Uma criatura curiosa era permanentemente curiosa, e
 * nada do que acontecia no mundo mexia nisso — não é uma emoção, é uma segunda
 * cópia de um gene.
 *
 * Agora ela lê o mundo: sobe onde a criatura JÁ CONHECE e desce onde é
 * novidade. É daí que sai o território sem ninguém desenhar território — o
 * bicho anda até o que conhece acabar, e o que conhece acaba onde ele parou de
 * andar. O mapa cresce por uso.
 */

const CONFIG = { width: 600, height: 600 };
const DT = 1 / 20;

function so(seed = 5): { world: World; id: number } {
  const world = createWorld(CONFIG, seed);
  spawnCreatures(world, 1);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  let id = -1;
  world.store(Creature).forEach((_tag, e) => (id = e));
  const needs = world.store(Needs).get(id)!;
  needs.hunger = 0;
  needs.thirst = 0;
  needs.health = 1;
  const feel = world.store(Emotions).get(id)!;
  feel.fear = 0;
  feel.curiosity = 0;
  world.store(Mind).get(id)!.intent = 'wander';
  return { world, id };
}

/** Segura a criatura num ponto e roda só a emoção. Devolve a média da inquietação. */
function ficar(world: World, id: number, x: number, y: number, segundos: number): number {
  const run = new SystemScheduler().add(creatureIndexSystem).add(emotionSystem);
  const spot = world.store(Transform).get(id)!;
  const needs = world.store(Needs).get(id)!;
  const feel = world.store(Emotions).get(id)!;
  let soma = 0;
  let contas = 0;
  for (let tick = 0; tick < segundos / DT; tick++) {
    spot.x = x;
    spot.y = y;
    // A fome fecha a cabeça de propósito no sistema; aqui ela não é o assunto.
    needs.hunger = 0;
    run.update(world, DT);
    world.tick += 1;
    soma += feel.curiosity;
    contas += 1;
  }
  return soma / contas;
}

describe('o mapa se desenha andando', () => {
  it('ficar num lugar torna aquele lugar conhecido — e só aquele', () => {
    const { world, id } = so();
    const memory = world.store(Memory).get(id)!;
    ficar(world, id, 150, 150, 30);

    const aqui = memory.familiarityOf(subjects.place(150, 150));
    const doOutroLado = memory.familiarityOf(subjects.place(450, 450));
    console.log(`onde ficou: ${aqui.toFixed(2)} · do outro lado: ${doOutroLado.toFixed(2)}`);
    expect(aqui, 'meio minuto parada ali e o lugar não virou conhecido').toBeGreaterThan(0.6);
    expect(doOutroLado, 'conheceu um canto onde nunca esteve').toBe(0);
  });

  it('e conhecer não é perdoar: o lugar ruim continua ruim', () => {
    // A armadilha silenciosa. Marcar familiaridade com `record(lugar, 0, peso)`
    // faria média ponderada, e um canto onde a criatura quase morreu iria
    // virando neutro só de ela ficar parada lá. Por isso `visit` existe.
    const { world, id } = so();
    const memory = world.store(Memory).get(id)!;
    memory.record(subjects.place(150, 150), -0.9, 0.8);
    const antes = memory.valenceOf(subjects.place(150, 150));

    ficar(world, id, 150, 150, 60);
    const depois = memory.valenceOf(subjects.place(150, 150));
    console.log(`opinião sobre o lugar ruim: ${antes.toFixed(2)} → ${depois.toFixed(2)}`);
    expect(depois, 'ficar ali apagou o que aconteceu ali').toBeLessThan(-0.5);
    expect(memory.familiarityOf(subjects.place(150, 150)), 'nem ficou conhecido').toBeGreaterThan(
      0.8,
    );
  });
});

describe('a curiosidade lê o mundo', () => {
  /** A mesma criatura, o mesmo tempo — só muda se o canto já é conhecido. */
  function inquietacao(conhecido: boolean): number {
    const { world, id } = so(9);
    if (conhecido) {
      // Um canto já sabido de cor, sem nenhuma opinião a respeito.
      world.store(Memory).get(id)!.visit(subjects.place(150, 150), 1);
    }
    // A MÉDIA, e não o valor final: parada tempo demais, o canto desconhecido
    // vira conhecido e os dois casos acabam iguais — que é justamente o
    // sistema funcionando. O que separa os dois é o CAMINHO até lá.
    return ficar(world, id, 150, 150, 25);
  }

  it('sobe no quintal de sempre e desce no canto que ela nunca viu', () => {
    const noConhecido = inquietacao(true);
    const noNovo = inquietacao(false);
    console.log(`no quintal: ${noConhecido.toFixed(3)} · no desconhecido: ${noNovo.toFixed(3)}`);

    // O CONTROLE É DE PERMUTAÇÃO: mesma semente, mesma criatura, mesmo ponto do
    // mapa, mesmo tempo parada. A única diferença é o que ela já sabia.
    expect(noConhecido, 'o lugar conhecido não deu inquietação nenhuma').toBeGreaterThan(
      // Medido: 0,564 contra 0,481, uns dezessete por cento. A margem é
      // pequena porque o efeito é sutil de propósito — a familiaridade modula o
      // temperamento, não o substitui.
      noNovo * 1.1,
    );
  });

  it('e a familiaridade modula, não zera — quem não tem o gene não fica curiosa', () => {
    // Medido no jardim de verdade: o gene de curiosidade fica em 0,22 na média,
    // e a primeira versão multiplicava o gene pela familiaridade direto. Dava
    // 0,05 — menos que a versão antiga, que era 0,15. Uma mudança que se
    // propunha a causar exploração estava apagando-a.
    const { world, id } = so(9);
    const gene = world.store(Personality).get(id)!.curiosity;
    world.store(Memory).get(id)!.visit(subjects.place(150, 150), 1);
    ficar(world, id, 150, 150, 60);
    const inquieta = world.store(Emotions).get(id)!.curiosity;
    console.log(`gene ${gene.toFixed(2)} → inquietação no quintal ${inquieta.toFixed(2)}`);

    // No canto mais conhecido do mundo ela passa do próprio gene — é a coceira
    // de sair. Mas não vira outra criatura: continua presa ao temperamento.
    expect(inquieta, 'o quintal conhecido não coçou nada').toBeGreaterThan(gene);
    expect(inquieta, 'virou curiosa sem ter o gene').toBeLessThan(gene * 1.6);
  });
});
