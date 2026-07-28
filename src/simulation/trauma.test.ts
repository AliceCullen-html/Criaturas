import { describe, it, expect } from 'vitest';
import { subjects } from '@core';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Bio, Creature, Emotions, Memory, Personality } from '@creatures';
import { createWorld } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { creatureIndexSystem } from './creatureIndex';
import { emotionSystem } from './systems/emotionSystem';
import { fearLearningSystem } from './systems/fearLearningSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';
import { roughGesture } from './handActions';

const CONFIG = { width: 600, height: 600 };
const DT = 1 / 20;

function garden(count = 2, seed = 4): World {
  const world = createWorld(CONFIG, seed);
  spawnCreatures(world, count);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

function everyone(world: World): number[] {
  const ids: number[] = [];
  world.store(Creature).forEach((_tag, id) => ids.push(id));
  return ids;
}

/** Roda só a emoção, por `seconds` de jardim. */
function rest(world: World, seconds: number): void {
  const scheduler = new SystemScheduler().add(emotionSystem);
  for (let tick = 0; tick < seconds / DT; tick++) scheduler.update(world, DT);
}

/**
 * A CICATRIZ.
 *
 * O trauma já existia e já descia devagar — mas descia até zero, e isso fazia
 * de toda crueldade uma coisa temporária: bastava esperar. Uma criatura que
 * apanhou muito não volta a ser a de antes, e é isto que se cobra aqui.
 */
describe('o que não passa', () => {
  it('um susto não deixa marca', () => {
    const world = garden(1);
    const id = everyone(world)[0]!;
    const emotions = world.store(Emotions).get(id)!;

    roughGesture(world, id, 1400, 1, 0);
    rest(world, 60);

    expect(emotions.scar).toBe(0);
  });

  it('mas viver assustada deixa — e a marca não sai mais', () => {
    const world = garden(1);
    const id = everyone(world)[0]!;
    const emotions = world.store(Emotions).get(id)!;

    // Uma tarde de maus-tratos: pancada, um tempo de terror, outra pancada.
    for (let round = 0; round < 6; round++) {
      roughGesture(world, id, 1400, 1, 0);
      rest(world, 20);
    }
    const marca = emotions.scar;
    expect(marca, 'nem apanhando seis vezes ela ficou marcada').toBeGreaterThan(0.1);

    // Meia hora de paz. O trauma cede... até a cicatriz, e para ali.
    rest(world, 1800);
    expect(emotions.trauma).toBeGreaterThanOrEqual(emotions.scar - 0.001);
    expect(emotions.scar).toBeGreaterThan(marca * 0.5);
    // E o medo dela nunca mais volta ao zero de antes.
    expect(emotions.fear).toBeGreaterThan(0.15);
  });

  it('a marca cede um pouco com uma vida boa — muito devagar', () => {
    const world = garden(1);
    const id = everyone(world)[0]!;
    const emotions = world.store(Emotions).get(id)!;
    emotions.scar = 0.5;
    emotions.trauma = 0.5;

    // Sem carinho nenhum — infeliz e desconfiada —, ela não melhora.
    const scheduler = new SystemScheduler().add(emotionSystem);
    for (let tick = 0; tick < 600 / DT; tick++) {
      emotions.happiness = 0.2;
      emotions.trust = 0.1;
      scheduler.update(world, DT);
    }
    const sozinha = emotions.scar;
    expect(sozinha).toBeGreaterThanOrEqual(0.5);

    // Com felicidade e confiança altas — o que só acontece se alguém cuidar —
    // a marca começa a ceder.
    for (let tick = 0; tick < 600 / DT; tick++) {
      emotions.happiness = 0.8;
      emotions.trust = 0.8;
      scheduler.update(world, DT);
    }
    expect(emotions.scar).toBeLessThan(sozinha);
    // Mas dez minutos de vida boa não apagam meia vida de medo.
    expect(emotions.scar).toBeGreaterThan(0.2);
  });
});

/**
 * O MEDO QUE SE APRENDE OLHANDO.
 *
 * É o que faz a crueldade ter consequência além da vítima — e o que faz um
 * jardim ter cultura em vez de indivíduos isolados dividindo o mesmo mapa.
 */
describe('o medo atravessa de um bicho para o outro', () => {
  function cena(): { world: World; vitima: number; testemunha: number } {
    const world = garden(2);
    const [vitima, testemunha] = everyone(world) as [number, number];
    const transforms = world.store(Transform);
    const here = transforms.get(vitima)!;
    // A testemunha do lado, olhando.
    const there = transforms.get(testemunha)!;
    there.x = here.x + 30;
    there.y = here.y;
    world.setResource(PlayerResource, { x: here.x, y: here.y, present: true });
    return { world, vitima, testemunha };
  }

  it('quem vê outro em pânico perto da sua mão aprende a temer você', () => {
    const { world, vitima, testemunha } = cena();
    const deles = world.store(Emotions).get(vitima)!;
    deles.fear = 0.9;
    world.store(Memory).get(vitima)!.record(subjects.player(), -1, 1);

    const olhos = world.store(Emotions).get(testemunha)!;
    olhos.fear = 0;
    const memoria = world.store(Memory).get(testemunha)!;
    expect(memoria.valenceOf(subjects.player())).toBe(0);

    const scheduler = new SystemScheduler().add(creatureIndexSystem).add(fearLearningSystem);
    for (let tick = 0; tick < 20 * 20; tick++) {
      deles.fear = 0.9; // a vítima segue apavorada durante a cena
      scheduler.update(world, DT);
    }

    expect(olhos.fear, 'não pegou medo nenhum').toBeGreaterThan(0.2);
    expect(memoria.valenceOf(subjects.player()), 'não aprendeu de quem é o medo').toBeLessThan(
      -0.2,
    );
  });

  it('mas não culpa você por um medo que não é seu', () => {
    const { world, vitima, testemunha } = cena();
    const deles = world.store(Emotions).get(vitima)!;
    deles.fear = 0.9;
    // A vítima não tem nada contra você: o pânico dela é de outra coisa.

    const olhos = world.store(Emotions).get(testemunha)!;
    olhos.fear = 0;
    const memoria = world.store(Memory).get(testemunha)!;

    const scheduler = new SystemScheduler().add(creatureIndexSystem).add(fearLearningSystem);
    for (let tick = 0; tick < 20 * 20; tick++) {
      deles.fear = 0.9;
      scheduler.update(world, DT);
    }

    expect(olhos.fear, 'o susto se pega de qualquer jeito').toBeGreaterThan(0.2);
    expect(memoria.valenceOf(subjects.player()), 'culpou você à toa').toBe(0);
  });

  it('e o filhote aprende muito mais depressa que o adulto', () => {
    const medoDe = (bebe: boolean): number => {
      const { world, vitima, testemunha } = cena();
      const deles = world.store(Emotions).get(vitima)!;
      deles.fear = 0.9;
      world.store(Memory).get(vitima)!.record(subjects.player(), -1, 1);

      const bio = world.store(Bio).get(testemunha)!;
      bio.age = bebe ? bio.lifespan * 0.02 : bio.lifespan * 0.5;
      // A mesma coragem nos dois, para medir só a idade.
      world.store(Personality).get(testemunha)!.bravery = 0.5;
      const olhos = world.store(Emotions).get(testemunha)!;
      olhos.fear = 0;

      const scheduler = new SystemScheduler().add(creatureIndexSystem).add(fearLearningSystem);
      for (let tick = 0; tick < 20 * 2; tick++) {
        deles.fear = 0.9;
        scheduler.update(world, DT);
      }
      return olhos.fear;
    };

    expect(medoDe(true)).toBeGreaterThan(medoDe(false) * 2);
  });
});
