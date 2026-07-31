import { describe, it, expect } from 'vitest';
import { subjects } from '@core';
import { SystemScheduler, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Bio, Creature, Identity, Memory } from '@creatures';
import { createWorld } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { Goal } from './systems/goalSystem';
import { SagaResource, createSaga, sagaSystem } from './systems/sagaSystem';
import { ChronicleResource, createChronicle } from './chronicle';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * O HISTORIADOR.
 *
 * Todo registro do livro era um sistema falando de si mesmo: quem brotou avisa
 * que brotou, quem morreu avisa que morreu. São acontecimentos, e cabem dentro
 * de um sistema só, porque é o próprio sistema que os causa.
 *
 * As coisas mais interessantes de um jardim vivo não cabem em nenhum sistema.
 * "Cinco criaturas passaram a viver em volta do mesmo canto" só se vê olhando
 * os objetivos de todo mundo ao mesmo tempo; "a mais velha que já viveu aqui"
 * exige lembrar de quem já morreu. É a diferença entre um diário de bordo e um
 * historiador — e é o historiador que transforma uma população num povo.
 */

const DT = 1 / 20;
/** O historiador olha de trinta em trinta segundos. */
const UMA_OLHADA = 35;

function jardim(quantos: number, seed = 5): { world: World; ids: number[] } {
  const world = createWorld({ width: 600, height: 600 }, seed);
  spawnCreatures(world, quantos);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  world.setResource(ChronicleResource, createChronicle());
  world.setResource(SagaResource, createSaga());
  const ids: number[] = [];
  world.store(Creature).forEach((_tag, id) => ids.push(id));
  return { world, ids };
}

function olhar(world: World, segundos = UMA_OLHADA): void {
  const run = new SystemScheduler().add(sagaSystem);
  for (let tick = 0; tick < segundos / DT; tick++) {
    run.update(world, DT);
    world.tick += 1;
  }
}

const livro = (world: World): string[] =>
  world.getResource(ChronicleResource).entries.map((e) => e.text);

describe('o livro repara no que ninguém anunciou', () => {
  it('um grupo que se formou sozinho vira história', () => {
    // NINGUÉM AS JUNTOU. Cada uma escolheu por conta própria, e o fato só
    // existe quando se olham os objetivos de todas ao mesmo tempo — coisa que
    // o sistema de objetivos, que trata de uma criatura por vez, não faz.
    const { world, ids } = jardim(6);
    const canto = subjects.place(450, 450);
    for (const id of ids.slice(0, 5)) {
      world.store(Goal).set(id, { subject: canto, elapsed: 0, rethinkIn: 999 });
    }
    olhar(world);
    const conta = livro(world).filter((t) => t.includes('mesmo canto'));
    console.log(conta.join(' · '));
    expect(conta.length, 'cinco criaturas na mesma vida e o livro não reparou').toBe(1);
  });

  it('mas duas não são um grupo', () => {
    const { world, ids } = jardim(6, 11);
    const canto = subjects.place(450, 450);
    for (const id of ids.slice(0, 2)) {
      world.store(Goal).set(id, { subject: canto, elapsed: 0, rethinkIn: 999 });
    }
    olhar(world);
    expect(livro(world).filter((t) => t.includes('mesmo canto')), 'duas viraram multidão').toEqual(
      [],
    );
  });

  it('a mais velha que já viveu no jardim — e só quando o posto TROCA de dono', () => {
    const { world, ids } = jardim(3, 17);
    const [a, b] = ids as [number, number, number];
    // Todas as idades à mão: quem nasce num jardim já vem com idade sorteada,
    // e uma terceira criatura mais velha que as duas roubaria o posto.
    for (const id of ids) world.store(Bio).get(id)!.age = 50;
    // E os nomes à mão também: numa ninhada de três, dois nomes iguais saem por
    // acaso — e aí a troca de decana não é troca de dono nenhuma.
    ids.forEach((id, i) => (world.store(Identity).get(id)!.name = `Bicho${i}`));
    world.store(Bio).get(a)!.age = 500;
    world.store(Bio).get(b)!.age = 100;
    olhar(world);
    // A primeira decana não é notícia: alguém tem de ser a mais velha.
    expect(livro(world).filter((t) => t.includes('mais velha'))).toEqual([]);

    // Agora a outra passa por cima dela. Isso é história — e exige lembrar de
    // quem era antes, coisa que nenhum sistema do jogo tem motivo para fazer.
    world.store(Bio).get(b)!.age = 900;
    olhar(world);
    const nome = world.store(Identity).get(b)!.name;
    const conta = livro(world).filter((t) => t.includes('mais velha'));
    console.log(conta.join(' · '));
    expect(conta.length, 'a troca de decana passou em branco').toBe(1);
    expect(conta[0]).toContain(nome);
  });

  it('um gosto que virou costume — e só num jardim com gente bastante', () => {
    // A TRADIÇÃO, que é a coisa mais difícil de ver a olho nu: a maior parte do
    // jardim gostando da mesma coisa sem que ela tenha nada de especial. Uma
    // fruta venenosa não contaria — sobre veneno todo mundo acaba concordando
    // porque há um fato a descobrir. Sobre uma pena não há verdade nenhuma.
    const { world, ids } = jardim(10, 23);
    for (const id of ids.slice(0, 8)) {
      world.store(Memory).get(id)!.record(subjects.thing(3), 0.9, 1);
    }
    olhar(world);
    const conta = livro(world).filter((t) => t.includes('costume'));
    console.log(conta.join(' · '));
    expect(conta.length, 'oito de dez guardando a mesma coisa e nada no livro').toBe(1);

    // E num jardim pequeno demais não há costume que valha: três criaturas
    // gostando da mesma pedra é coincidência, não cultura.
    const pequeno = jardim(4, 29);
    for (const id of pequeno.ids) {
      pequeno.world.store(Memory).get(id)!.record(subjects.thing(3), 0.9, 1);
    }
    olhar(pequeno.world);
    expect(livro(pequeno.world).filter((t) => t.includes('costume')), 'quatro viraram cultura')
      .toEqual([]);
  });

  it('e nenhum marco se repete, por mais que o historiador olhe', () => {
    const { world, ids } = jardim(6, 31);
    const canto = subjects.place(450, 450);
    for (const id of ids.slice(0, 5)) {
      world.store(Goal).set(id, { subject: canto, elapsed: 0, rethinkIn: 999 });
    }
    olhar(world, UMA_OLHADA * 6);
    const conta = livro(world).filter((t) => t.includes('mesmo canto'));
    expect(conta.length, 'o livro repetiu o mesmo fato a cada olhada').toBe(1);
  });
});
