import { describe, it, expect } from 'vitest';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Bio, Creature, Emotions, Mind, Needs } from '@creatures';
import { createWorld } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { creatureIndexSystem } from './creatureIndex';
import { emotionSystem } from './systems/emotionSystem';
import { fearLearningSystem } from './systems/fearLearningSystem';
import { actionSystem } from './systems/actionSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * O ÂNIMO DO JARDIM.
 *
 * O jogador olhou a tela e perguntou: "a maioria com medo e solidão, por quê?".
 * Estava certo nas duas, e as duas tinham a mesma cara — números que só sabiam
 * subir. A solidão só cedia quando a criatura EXECUTAVA alguma coisa, e o medo
 * se contagiava sem teto, então bastava um susto para o jardim inteiro travar
 * em pânico. E um jardim em pânico não brota: a espécie acabava.
 *
 * Medido no jardim de verdade, semente do jogo, aos trinta minutos: 94% das
 * criaturas com medo, felicidade média 0,31, e três por cento vivendo bem o
 * bastante para se duplicar. Depois: 21% com medo, felicidade 0,57, quarenta
 * por cento aptas — e nenhuma das quatro sementes se extingue em três horas.
 */

const CONFIG = { width: 600, height: 600 };
const DT = 1 / 20;

function jardim(count: number, seed = 5): World {
  const world = createWorld(CONFIG, seed);
  spawnCreatures(world, count);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

const todos = (world: World): number[] => {
  const ids: number[] = [];
  world.store(Creature).forEach((_tag, id) => ids.push(id));
  return ids;
};

/** Põe cada criatura onde o teste quer. */
function poe(world: World, ids: number[], onde: Array<[number, number]>): void {
  ids.forEach((id, i) => {
    const spot = world.store(Transform).get(id);
    const at = onde[i];
    if (spot && at) {
      spot.x = at[0];
      spot.y = at[1];
      spot.prevX = at[0];
      spot.prevY = at[1];
    }
  });
}

/** Roda só o ânimo, prendendo todo mundo no lugar. */
function conviver(world: World, segundos: number, extra?: SystemScheduler): void {
  const run = extra ?? new SystemScheduler().add(creatureIndexSystem).add(emotionSystem);
  const fixos = todos(world).map((id) => {
    const t = world.store(Transform).get(id)!;
    return [id, t.x, t.y] as const;
  });
  for (let tick = 0; tick < segundos / DT; tick++) {
    for (const [id, x, y] of fixos) {
      const t = world.store(Transform).get(id);
      if (t) {
        t.x = x;
        t.y = y;
      }
    }
    run.update(world, DT);
    world.tick += 1;
  }
}

describe('a solidão cede com companhia', () => {
  it('quem está no meio de um grupo não fica sozinha — e quem está longe, fica', () => {
    // O CONTROLE É DE PERMUTAÇÃO: o mesmo jardim, a mesma semente, as mesmas
    // quatro criaturas. Só muda ONDE elas estão.
    const juntas = jardim(4);
    poe(juntas, todos(juntas), [
      [300, 300],
      [330, 300],
      [300, 330],
      [330, 330],
    ]);
    const espalhadas = jardim(4);
    poe(espalhadas, todos(espalhadas), [
      [60, 60],
      [540, 60],
      [60, 540],
      [540, 540],
    ]);

    for (const world of [juntas, espalhadas]) {
      for (const id of todos(world)) world.store(Emotions).get(id)!.loneliness = 0.6;
    }
    conviver(juntas, 60);
    conviver(espalhadas, 60);

    const media = (world: World): number => {
      const ids = todos(world);
      return ids.reduce((s, id) => s + world.store(Emotions).get(id)!.loneliness, 0) / ids.length;
    };
    const perto = media(juntas);
    const longe = media(espalhadas);
    console.log(`em grupo: ${perto.toFixed(2)} · espalhadas: ${longe.toFixed(2)}`);

    expect(perto, 'a companhia não aliviou nada').toBeLessThan(0.5);
    expect(longe, 'sozinha, a solidão devia crescer').toBeGreaterThan(0.6);
  });

  it('mas companhia não é convívio: sozinha no meio da multidão ainda falta alguma coisa', () => {
    // Se a presença zerasse a solidão, a criatura nunca mais procuraria
    // ninguém, e o convívio inteiro do jogo deixaria de acontecer.
    const world = jardim(5);
    poe(world, todos(world), [
      [300, 300],
      [320, 300],
      [300, 320],
      [320, 320],
      [310, 310],
    ]);
    for (const id of todos(world)) world.store(Emotions).get(id)!.loneliness = 0.9;
    conviver(world, 240);
    const menor = Math.min(...todos(world).map((id) => world.store(Emotions).get(id)!.loneliness));
    console.log(`depois de quatro minutos em grupo, a menos sozinha: ${menor.toFixed(2)}`);
    expect(menor, 'a multidão apagou a solidão e ninguém vai mais atrás de ninguém').toBeGreaterThan(
      0.15,
    );
  });
});

describe('o medo se espalha mas não se multiplica', () => {
  const comContagio = (): SystemScheduler =>
    new SystemScheduler().add(creatureIndexSystem).add(emotionSystem).add(fearLearningSystem);

  /** Um bicho em pânico permanente e `quantos` vizinhos em volta. */
  function panico(quantos: number, seed: number): { world: World; ids: number[]; fonte: number } {
    const world = jardim(quantos + 1, seed);
    const ids = todos(world);
    const grade: Array<[number, number]> = [[300, 300]];
    for (let i = 1; i <= quantos; i++) grade.push([300 + (i % 3) * 40, 300 + Math.floor(i / 3) * 40]);
    poe(world, ids, grade);
    for (const id of ids) {
      const e = world.store(Emotions).get(id)!;
      e.fear = 0;
      e.trauma = 0;
      e.scar = 0;
      e.pain = 0;
      world.store(Mind).get(id)!.intent = 'wander';
    }
    return { world, ids, fonte: ids[0]! };
  }

  /** Roda segurando a fonte em pânico (ou soltando-a). */
  function assistir(
    cena: { world: World; ids: number[]; fonte: number },
    segundos: number,
    segurando: boolean,
  ): void {
    const { world, ids, fonte } = cena;
    const run = comContagio();
    const pos = ids.map((id) => {
      const t = world.store(Transform).get(id)!;
      return [t.x, t.y] as const;
    });
    for (let tick = 0; tick < segundos / DT; tick++) {
      if (segurando) world.store(Emotions).get(fonte)!.fear = 1;
      ids.forEach((id, i) => {
        const t = world.store(Transform).get(id);
        if (t) {
          t.x = pos[i]![0];
          t.y = pos[i]![1];
        }
      });
      run.update(world, DT);
      world.tick += 1;
    }
  }

  it('o medo ATRAVESSA — o contágio continua existindo', () => {
    // O primeiro conserto que escrevi amorteceu tanto que nenhuma das nove
    // criaturas em volta de um bicho em pânico absoluto pegou medo nenhum em
    // noventa segundos. Apagar o recurso não é consertá-lo: o contágio do medo
    // é do briefing, e este teste existe para ele não sumir de novo.
    const cena = panico(8, 23);
    assistir(cena, 90, true);
    const medos = cena.ids.slice(1).map((id) => cena.world.store(Emotions).get(id)!.fear);
    const pegaram = medos.filter((f) => f > 0.2).length;
    console.log(`${pegaram}/8 pegaram medo · ${medos.map((f) => f.toFixed(2)).join(' ')}`);
    expect(pegaram, 'ninguém pegou o medo de quem está em pânico ao lado').toBeGreaterThanOrEqual(3);
  });

  it('mas ninguém fica mais apavorado do que aquilo que está vendo', () => {
    // A LINHA QUE MATA A EPIDEMIA. Sem ela, quem via um bicho a 0,6 podia
    // acabar a 0,7 e infectar de volta quem o infectou, mais forte — e numa
    // clareira cheia isso vira uma onda que se realimenta e nunca desce.
    const cena = panico(8, 23);
    assistir(cena, 90, true);
    const fonte = cena.world.store(Emotions).get(cena.fonte)!.fear;
    for (const id of cena.ids.slice(1)) {
      const seu = cena.world.store(Emotions).get(id)!.fear;
      expect(seu, `o vizinho ficou mais apavorado que a fonte`).toBeLessThan(fonte);
    }
  });

  it('e quando o susto passa, o bando desce junto', () => {
    // O que travava o jogo não era o medo: era o medo que nunca acabava. Aqui
    // o susto dura meio minuto e depois some do mundo — e o que se cobra é que
    // o jardim volte, em vez de ficar preso na própria onda.
    const cena = panico(8, 23);
    assistir(cena, 30, true);
    const noPico = cena.ids.map((id) => cena.world.store(Emotions).get(id)!.fear);
    assistir(cena, 150, false);
    const depois = cena.ids.map((id) => cena.world.store(Emotions).get(id)!.fear);
    const media = (l: number[]): number => l.reduce((a, b) => a + b, 0) / l.length;
    console.log(`no pico ${media(noPico).toFixed(2)} → depois ${media(depois).toFixed(2)}`);
    expect(media(noPico), 'o susto não chegou a assustar ninguém').toBeGreaterThan(0.2);
    expect(Math.max(...depois), 'alguém ficou preso no pânico').toBeLessThan(0.3);
  });
});

describe('o filhote sozinho', () => {
  const cena = (comAdulto: boolean): number => {
    const world = jardim(2, 31);
    const ids = todos(world);
    const [filhote, outro] = ids as [number, number];
    const bio = world.store(Bio).get(filhote)!;
    bio.age = bio.lifespan * 0.02;
    poe(world, ids, [
      [300, 300],
      comAdulto ? [340, 300] : [560, 560],
    ]);
    for (const id of ids) {
      const e = world.store(Emotions).get(id)!;
      e.fear = 0;
      e.trauma = 0;
      e.scar = 0;
      e.pain = 0;
      world.store(Mind).get(id)!.intent = 'wander';
      world.store(Needs).get(id)!.health = 1;
    }
    // O outro é adulto de verdade, para o filhote ter em quem se apoiar.
    const adulto = world.store(Bio).get(outro)!;
    adulto.age = adulto.lifespan * 0.5;

    conviver(world, 120, new SystemScheduler().add(creatureIndexSystem).add(actionSystem));
    return world.store(Emotions).get(filhote)!.fear;
  };

  it('fica com medo; junto de um adulto, não', () => {
    // O comentário no código já dizia "longe dos adultos" — e o código não
    // conferia nada: TODO filhote ganhava medo o tempo todo. Num jardim que se
    // duplica, e por isso vive cheio de filhotes, era uma fonte de medo que
    // nunca desligava.
    const acompanhado = cena(true);
    const sozinho = cena(false);
    console.log(`filhote com adulto: ${acompanhado.toFixed(3)} · sozinho: ${sozinho.toFixed(3)}`);
    expect(acompanhado, 'ganhou medo do lado de um adulto').toBe(0);
    expect(sozinho, 'sozinho no mato e sem medo nenhum').toBeGreaterThan(0.5);
  });
});
