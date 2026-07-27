import { describe, it, expect } from 'vitest';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Creature, Emotions, Identity, Memory, Mind, Needs, Words } from '@creatures';
import { KNOWN, WORD, WORD_TEXT, subjects } from '@core';
import {
  ambientSystem,
  createWorld,
  dayNightSystem,
  itemSystem,
  plantGrowthSystem,
  plantSpreadSystem,
  propSystem,
  weatherSystem,
  SceneryResource,
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
import {
  Chatter,
  SpeechResource,
  findComputer,
  showAndTell,
  teachWord,
  teachingSystem,
} from './systems/teachingSystem';
import { ChronicleResource, createChronicle } from './chronicle';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * A LINGUAGEM.
 *
 * O que se cobra aqui não é que o código de ensino rode: é que ele ACONTEÇA
 * sozinho num mundo vivo, com criaturas que têm mais o que fazer. Um sistema de
 * aprendizado que só funciona quando alguém o chama à mão é um recurso de
 * demonstração; o que interessa é o jardim onde, depois de meia hora, algumas
 * criaturas sabem dizer coisas — e onde uma delas ensinou a outra.
 *
 * E cobra-se o preço: aprender tem de ser LENTO e tem de depender de a criatura
 * estar bem. Se uma palavra entrasse em cinco segundos, ensinar não seria nada.
 */

const WORLD = { width: 700, height: 700 };
const DT = 1 / 20;

function garden(seed: number, population: number): World {
  const world = createWorld(WORLD, seed);
  spawnCreatures(world, population);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  world.setResource(DeathsResource, []);
  world.setResource(SpeechResource, []);
  world.setResource(ChronicleResource, createChronicle());
  return world;
}

const scheduler = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(eggSystem)
    .add(emotionSystem)
    .add(socialSystem)
    .add(teachingSystem)
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

/** Roda o mundo por tantos minutos. */
function live(world: World, run: SystemScheduler, minutes: number): void {
  for (let tick = 0; tick < 20 * 60 * minutes; tick++) {
    run.update(world, DT);
    world.tick += 1;
  }
}

/** Quantas palavras cada criatura sabe. */
function vocabularies(world: World): number[] {
  const sizes: number[] = [];
  world.store(Creature).forEach((_tag, entity) => {
    sizes.push(world.store(Words).get(entity)?.size ?? 0);
  });
  return sizes;
}

describe('a linguagem', () => {
  it('o computador ensina sozinho quem se aproxima dele', () => {
    const world = garden(1337, 14);
    const run = scheduler();
    const machine = findComputer(world.getResource(SceneryResource));
    expect(machine, 'o jardim nasceu sem computador').not.toBeNull();

    live(world, run, 15);

    const sizes = vocabularies(world);
    const falantes = sizes.filter((size) => size > 0).length;
    const total = sizes.reduce((sum, size) => sum + size, 0);
    console.log(
      `${sizes.length} vivas · ${falantes} falam · ${total} palavras aprendidas no total · ` +
        `maior vocabulário: ${Math.max(...sizes)}`,
    );

    // Ninguém foi mandado estudar. O que houve foi uma máquina no meio do
    // jardim e criaturas curiosas passando por ela.
    expect(falantes, 'ninguém aprendeu uma palavra em quinze minutos').toBeGreaterThan(0);

    // E cada palavra que entra SAI PELA BOCA. Sem isso o aprendizado é um
    // número subindo em silêncio, e o jogador não tem como saber que aconteceu.
    expect(
      world.getResource(SpeechResource).length,
      'ninguém disse nada em quinze minutos de jardim',
    ).toBeGreaterThan(0);
  });

  it('uma palavra custa tempo e atenção — não entra num piscar de olhos', () => {
    const world = garden(7, 4);
    const run = scheduler();
    run.update(world, DT);

    const [pupil] = [...aliveIds(world)];
    expect(pupil).toBeDefined();
    const lexicon = world.store(Words).get(pupil!)!;
    const needs = world.store(Needs).get(pupil!)!;
    const emotions = world.store(Emotions).get(pupil!)!;

    // Bem cuidada: sem fome, sem sede, sem medo. O melhor caso possível.
    needs.hunger = 0.1;
    needs.thirst = 0.1;
    emotions.fear = 0;
    emotions.stress = 0;
    emotions.curiosity = 1;

    let seconds = 0;
    while (!lexicon.knows(WORD.food) && seconds < 120) {
      teachWord(world, pupil!, WORD.food, 0.05 * DT);
      seconds += DT;
    }
    console.log(`palavra aprendida em ${seconds.toFixed(1)}s de estudo ininterrupto`);
    expect(lexicon.knows(WORD.food), 'não aprendeu nem com atenção total').toBe(true);
    expect(seconds, 'aprendeu rápido demais').toBeGreaterThan(5);

    // E com fome não entra nada: aprender é o que sobra quando não há urgência.
    needs.hunger = 0.95;
    const antes = lexicon.graspOf(WORD.water);
    for (let i = 0; i < 200; i++) teachWord(world, pupil!, WORD.water, 0.05 * DT);
    expect(lexicon.graspOf(WORD.water), 'aprendeu de barriga vazia').toBe(antes);
  });

  it('o que uma sabe se espalha para as outras — e leva conhecimento junto', () => {
    const world = garden(99, 22);
    const run = scheduler();
    run.update(world, DT);

    // Fora a máquina do jardim: assim a ÚNICA fonte de palavras deste mundo é
    // uma criatura. O que for aprendido aqui foi aprendido de alguém.
    const pieces = world.getResource(SceneryResource);
    const machineIndex = pieces.findIndex((piece) => piece.kind === 'computer');
    if (machineIndex >= 0) pieces.splice(machineIndex, 1);

    // Uma sabedora, colocada no meio do grupo: sabe as palavras e sabe que
    // certa fruta faz mal. Ninguém mais sabe nada.
    const ids = [...aliveIds(world)];
    // METADE do jardim já sabe falar — é o mundo depois de o computador ter
    // ensinado um punhado delas. Não é frouxidão de teste: com uma sabedora só,
    // o que se mede é a sorte de ela sobreviver e de esbarrar em alguém (das
    // três primeiras versões, duas morreram antes dos doze minutos). Com metade
    // da população, mede-se o que interessa — se a palavra ATRAVESSA.
    const sages = ids.filter((_id, i) => i % 2 === 0);
    for (const sage of sages) {
      const sageWords = world.store(Words).get(sage)!;
      for (let word = 0; word < WORD_TEXT.length; word++) sageWords.hear(word, 1);
      world.store(Memory).get(sage)!.record(subjects.food(2), -0.9, 1);
    }
    const sage = sages[0]!;

    // Todo mundo em volta dela, bem alimentado: é uma roda de conversa.
    const here = world.store(Transform).get(sage)!;
    for (const id of ids) {
      const spot = world.store(Transform).get(id)!;
      spot.x = here.x + (id % 5) * 12 - 24;
      spot.y = here.y + (id % 3) * 12 - 12;
      const needs = world.store(Needs).get(id)!;
      needs.hunger = 0.15;
      needs.thirst = 0.15;
      world.store(Chatter).get(id);
    }

    live(world, run, 20);

    const vivas = sages.filter((id) => world.store(Creature).has(id)).length;
    const alunos = ids.filter(
      (id) => !sages.includes(id) && (world.store(Words).get(id)?.size ?? 0) > 0,
    );
    const cientes = alunos.filter(
      (id) => (world.store(Memory).get(id)?.valenceOf(subjects.food(2)) ?? 0) < -0.1,
    );
    console.log(
      `${alunos.length} de ${ids.length - sages.length} aprenderam alguma palavra ouvindo · ` +
        `${cientes.length} souberam da fruta ruim sem nunca terem provado · ` +
        `${vivas} das ${sages.length} sabedoras originais ainda viviam`,
    );

    expect(alunos.length, 'a palavra não passou de uma cabeça para outra').toBeGreaterThan(0);
    // O ponto inteiro da linguagem: o aviso viajou com a palavra. Nenhuma
    // dessas criaturas comeu a fruta — elas SOUBERAM.
    expect(cientes.length, 'a palavra passou mas o conhecimento não').toBeGreaterThan(0);
  });

  it('você só ensina quem está prestando atenção', () => {
    const world = garden(21, 3);
    const run = scheduler();
    run.update(world, DT);
    const pupil = [...aliveIds(world)][0]!;
    const mind = world.store(Mind).get(pupil)!;
    const needs = world.store(Needs).get(pupil)!;
    needs.hunger = 0.1;
    needs.thirst = 0.1;

    mind.attention = 0;
    mind.affection = 0;
    expect(showAndTell(world, pupil, WORD.food), 'ensinou de costas').toBe('distracted');

    // Chamada, ela olha — e aí a lição entra.
    mind.attention = 2;
    const respostas = new Set<string>();
    for (let i = 0; i < 20; i++) respostas.add(showAndTell(world, pupil, WORD.food));
    expect(world.store(Words).get(pupil)!.knows(WORD.food), 'não aprendeu olhando').toBe(true);
    expect(respostas.has('learned'), 'nunca respondeu que aprendeu').toBe(true);

    // E a fala aparece para o mundo ver: sem isso o jogador não faz ideia de
    // que alguma coisa entrou.
    expect(world.getResource(SpeechResource).length, 'ninguém disse nada').toBeGreaterThan(0);
  });

  it('saber a palavra muda o que ela faz — não é enfeite de ficha', () => {
    const world = garden(5, 6);
    const run = scheduler();
    run.update(world, DT);
    const ids = [...aliveIds(world)];

    // Metade aprende "água", metade não. Nada mais muda.
    const letradas = ids.filter((_id, i) => i % 2 === 0);
    for (const id of letradas) world.store(Words).get(id)!.hear(WORD.water, 1);

    // Todas com a mesma sede, no mesmo instante.
    for (const id of ids) {
      const needs = world.store(Needs).get(id)!;
      needs.thirst = 0.45;
      needs.hunger = 0.2;
      world.store(Mind).get(id)!.commitment = 0;
    }

    let comPalavra = 0;
    let semPalavra = 0;
    for (let tick = 0; tick < 20 * 40; tick++) {
      run.update(world, DT);
      world.tick += 1;
      for (const id of ids) {
        if (world.store(Mind).get(id)?.intent !== 'seekWater') continue;
        if (letradas.includes(id)) comPalavra += 1;
        else semPalavra += 1;
      }
    }
    console.log(
      `quem sabe "água" procurou o lago em ${comPalavra} tiques; quem não sabe, ${semPalavra}`,
    );
    expect(comPalavra, 'a palavra não mudou nada no comportamento').toBeGreaterThan(semPalavra);
  });

  it('o livro registra a primeira palavra da espécie', () => {
    const world = garden(1337, 6);
    const run = scheduler();
    run.update(world, DT);
    const pupil = [...aliveIds(world)][0]!;
    const needs = world.store(Needs).get(pupil)!;
    needs.hunger = 0.1;
    needs.thirst = 0.1;
    world.store(Mind).get(pupil)!.attention = 5;

    for (let i = 0; i < 30; i++) showAndTell(world, pupil, WORD.water);

    const book = world.getResource(ChronicleResource);
    const nome = world.store(Identity).get(pupil)!.name;
    expect(book.seen.has('primeira-palavra'), 'a primeira palavra não virou marco').toBe(true);
    const marco = book.entries.find((entry) => entry.landmark && entry.text.includes(nome));
    console.log(`livro: ${marco?.text}`);
    expect(marco, 'o marco não menciona quem aprendeu').toBeDefined();

    // E a palavra aprendida não se perde, mesmo sem ninguém repetir por muito
    // tempo: uma vez sabida, é dela.
    const lexicon = world.store(Words).get(pupil)!;
    lexicon.fade(600);
    expect(lexicon.graspOf(WORD.water), 'esqueceu o que já sabia').toBeGreaterThanOrEqual(KNOWN);
  });
});

/** Ids de todas as criaturas vivas. */
function aliveIds(world: World): number[] {
  const ids: number[] = [];
  world.store(Creature).forEach((_tag, entity) => ids.push(entity));
  return ids;
}
