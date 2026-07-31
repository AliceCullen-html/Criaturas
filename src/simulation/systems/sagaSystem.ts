import { defineResource, type System } from '@engine';
import { Bio, Creature, Identity, Memory } from '@creatures';
import { chronicle } from '../chronicle';
import { Goal } from './goalSystem';

/**
 * O QUE NINGUÉM ANUNCIOU.
 *
 * Todo registro do livro, até aqui, era um sistema falando de si mesmo: quem
 * brotou avisa que brotou, quem morreu avisa que morreu, quem aprendeu olhando
 * avisa que aprendeu. São acontecimentos, e são bons — mas todos eles cabem
 * dentro de um sistema só, porque é o próprio sistema que os causa.
 *
 * As coisas mais interessantes de um jardim vivo não cabem em nenhum sistema.
 * "Cinco criaturas passaram a viver em volta do mesmo canto" não é obra do
 * sistema de objetivos: é o que se vê olhando os objetivos de todo mundo ao
 * mesmo tempo. "Ninguém neste jardim gosta de pena" não é obra da rotina do
 * tesouro. "Kiro é o mais velho que já viveu aqui" exige lembrar de quem já
 * morreu, coisa que nenhum sistema tem motivo para fazer.
 *
 * Este sistema não CAUSA nada. Ele olha o jardim de tempos em tempos e repara.
 * É a diferença entre um diário de bordo e um historiador — e é o historiador
 * que transforma uma população num povo com passado.
 */

export interface Saga {
  /** A maior idade já alcançada neste jardim, em segundos, e de quem. */
  oldestAge: number;
  oldestName: string;
  /** A maior população que o jardim já teve. */
  peak: number;
  /** Segundos até a próxima olhada. */
  nextLook: number;
  /** Quantos padrões já viraram entrada — só para o teste medir. */
  noticed: number;
}
export const SagaResource = defineResource<Saga>('Saga');

export const createSaga = (): Saga => ({
  oldestAge: 0,
  oldestName: '',
  peak: 0,
  nextLook: 0,
  noticed: 0,
});

/**
 * De quanto em quanto tempo o historiador olha.
 *
 * Meio minuto. Não é um sistema de reação: é uma varredura por cima de todo o
 * jardim, e fazê-la a cada quadro custaria caro para reparar na mesma coisa
 * vinte vezes por segundo.
 */
const LOOK_EVERY = 30;
/**
 * Quantas criaturas vivendo em volta da mesma coisa já são um GRUPO.
 *
 * Quatro. Duas é coincidência e três é um começo; quatro criaturas que, cada
 * uma por conta própria, acabaram querendo a mesma coisa é um fato sobre o
 * jardim — e ninguém as juntou.
 */
const A_CROWD = 4;
/** E a fração do jardim que precisa concordar para um gosto virar costume. */
const A_CUSTOM = 0.6;
/** Abaixo desta opinião ninguém "gosta" de nada: é indiferença. */
const LIKES_IT = 0.25;
/** Só vale contar costume num jardim com gente bastante para haver costume. */
const ENOUGH_PEOPLE = 8;

export const sagaSystem: System = {
  name: 'saga',
  update(world, dt) {
    if (!world.hasResource(SagaResource)) return;
    const saga = world.getResource(SagaResource);
    saga.nextLook -= dt;
    if (saga.nextLook > 0) return;
    saga.nextLook = LOOK_EVERY;

    const creatures = world.store(Creature);
    const bios = world.store(Bio);
    const identities = world.store(Identity);
    const goals = world.store(Goal);
    const memories = world.store(Memory);

    let alive = 0;
    let eldest = -1;
    let eldestAge = 0;
    const wanting = new Map<string, number>();
    const liking = new Map<string, number>();

    creatures.forEach((_tag, entity) => {
      alive += 1;
      const bio = bios.get(entity);
      if (bio && bio.age > eldestAge) {
        eldestAge = bio.age;
        eldest = entity;
      }
      const subject = goals.get(entity)?.subject;
      if (subject) wanting.set(subject, (wanting.get(subject) ?? 0) + 1);
      // O gosto por coisas — a única opinião do jogo sem verdade por trás, e
      // por isso a única que pode virar costume em vez de conhecimento.
      memories.get(entity)?.forEachAbout('thing:', (thing, trace) => {
        if (trace.valence * trace.strength > LIKES_IT) {
          liking.set(thing, (liking.get(thing) ?? 0) + 1);
        }
      });
    });

    // ---- O JARDIM MAIS CHEIO QUE JÁ ESTEVE -----------------------------
    // Um recorde só é recorde porque alguém lembrava do anterior, e nenhum
    // sistema do jogo tem motivo para lembrar disso.
    if (alive > saga.peak) {
      const before = saga.peak;
      saga.peak = alive;
      if (before > 0 && alive >= 20 && alive >= before + 10) {
        saga.noticed += 1;
        chronicle(world, `pico-${alive}`, `O jardim nunca esteve tão cheio: ${alive} vivas`, true);
      }
    }

    // ---- QUEM VIVEU MAIS ------------------------------------------------
    if (eldest >= 0 && eldestAge > saga.oldestAge) {
      const name = identities.get(eldest)?.name ?? '?';
      const wasSomeoneElse = saga.oldestName !== '' && saga.oldestName !== name;
      saga.oldestAge = eldestAge;
      saga.oldestName = name;
      if (wasSomeoneElse) {
        saga.noticed += 1;
        chronicle(
          world,
          `decana-${name}`,
          `${name} passou a ser a mais velha que este jardim já teve`,
          true,
        );
      }
    }

    // ---- UM GRUPO SE FORMOU ---------------------------------------------
    // Ninguém as juntou. Cada uma escolheu sozinha, pela própria memória e
    // pela própria falta, e acabaram todas querendo a mesma coisa.
    for (const [subject, count] of wanting) {
      if (count < A_CROWD) continue;
      saga.noticed += 1;
      chronicle(
        world,
        `grupo-${subject}`,
        subject.startsWith('creature:')
          ? `${count} criaturas passaram a viver em volta da mesma companhia`
          : `${count} criaturas fizeram do mesmo canto do jardim a vida delas`,
        true,
      );
    }

    // ---- UM GOSTO VIROU COSTUME -----------------------------------------
    // A coisa mais difícil de ver a olho nu, e a que o briefing chama de
    // tradição: a maior parte do jardim gostando da mesma coisa sem que ela
    // tenha nada de especial. Uma fruta venenosa não conta — sobre veneno todo
    // mundo acaba concordando porque há um fato a descobrir. Sobre uma pena,
    // não: gostar dela é história.
    if (alive >= ENOUGH_PEOPLE) {
      for (const [thing, count] of liking) {
        if (count < alive * A_CUSTOM) continue;
        saga.noticed += 1;
        chronicle(
          world,
          `costume-${thing}`,
          `Virou costume neste jardim: quase todas guardam a mesma coisa`,
          true,
        );
      }
    }
  },
};
