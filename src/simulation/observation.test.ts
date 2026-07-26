import { describe, it, expect } from 'vitest';
import { POSE, POSE_NAMES } from '@core';
import { SystemScheduler, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Behavior, Bio, Creature, Identity, Mind, Personality } from '@creatures';
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
import { searchSystem } from './systems/searchSystem';
import { idleSystem } from './systems/idleSystem';
import { planSystem, Plan } from './systems/planSystem';
import { ROUTINE, ROUTINE_NAMES } from './routines';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * O TESTE DO OBSERVADOR.
 *
 * A regra principal do projeto, virada em verificação: acompanhar UMA criatura
 * por cinco minutos e sentir que ela tem personalidade própria. Aqui o
 * "sentir" vira número — quantas coisas diferentes ela fez, e se alguma coisa
 * só dominou o tempo todo.
 *
 * Se este teste começar a falhar, o jogo voltou a parecer um NPC esperando
 * ordens, e nenhum sistema novo conserta isso.
 */

const WORLD = { width: 600, height: 600 };
const DT = 1 / 20;
const OBSERVED_MINUTES = 5;

function makeGarden(seed: number): World {
  const world = createWorld(WORLD, seed);
  spawnCreatures(world, 18);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  return world;
}

const scheduler = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(emotionSystem)
    .add(planSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(reproductionSystem)
    .add(metabolismSystem)
    .add(itemSystem)
    .add(searchSystem)
    .add(weatherSystem)
    .add(dayNightSystem)
    .add(ambientSystem)
    .add(propSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);

const INTENT_NAMES: Record<string, string> = {
  wander: 'perambula',
  seekFood: 'vai comer',
  seekWater: 'vai beber',
  sleep: 'dorme',
  flee: 'foge',
  approachPlayer: 'procura você',
  socialize: 'faz companhia',
  play: 'brinca',
  attack: 'briga',
  share: 'divide comida',
  mate: 'corteja',
  watch: 'observa',
  shelter: 'se abriga',
  sunbathe: 'toma sol',
  follow: 'segue alguém',
  search: 'procura algo',
};

describe('teste do observador', () => {
  it('cinco minutos com uma criatura rendem uma história, não uma repetição', () => {
    const world = makeGarden(4242);
    const run = scheduler();

    // Escolhe a primeira criatura e conta a vida dela.
    let watched = -1;
    world.store(Creature).forEach((_tag, entity) => {
      if (watched < 0) watched = entity;
    });
    const name = world.store(Identity).get(watched)?.name ?? '?';
    const traits = world.store(Personality).get(watched)!;

    const story: string[] = [];
    const poseCounts = new Map<number, number>();
    const intentCounts = new Map<string, number>();
    let lastLine = '';

    for (let tick = 0; tick < 20 * 60 * OBSERVED_MINUTES; tick++) {
      run.update(world, DT);
      if (!world.store(Creature).has(watched)) break;

      const mind = world.store(Mind).get(watched)!;
      const behavior = world.store(Behavior).get(watched)!;

      // A rotina em curso tem prioridade no relato: é ela que dá o enredo.
      const plan = world.store(Plan).get(watched);
      const line =
        plan && plan.routine !== ROUTINE.none
          ? (ROUTINE_NAMES[plan.routine] ?? '?')
          : behavior.pose !== POSE.none
            ? (POSE_NAMES[behavior.pose] ?? '?')
            : (INTENT_NAMES[mind.intent] ?? mind.intent);

      if (line !== lastLine) {
        story.push(`${(tick / 20).toFixed(0).padStart(3)}s  ${line}`);
        lastLine = line;
        if (behavior.pose !== POSE.none) {
          poseCounts.set(behavior.pose, (poseCounts.get(behavior.pose) ?? 0) + 1);
        } else {
          intentCounts.set(mind.intent, (intentCounts.get(mind.intent) ?? 0) + 1);
        }
      }
    }

    const bio = world.store(Bio).get(watched);
    console.log(
      `\n=== ${OBSERVED_MINUTES} minutos com ${name} ===\n` +
        `curiosidade ${traits.curiosity.toFixed(2)} · coragem ${traits.bravery.toFixed(2)} · ` +
        `atividade ${traits.activity.toFixed(2)} · brincalhice ${traits.playfulness.toFixed(2)}\n` +
        story.join('\n') +
        (bio ? '' : '\n(morreu durante a observação)') +
        `\n--- ${story.length} acontecimentos, ${poseCounts.size} gestos diferentes ---\n`,
    );

    // Uma vida observável tem variedade e não é dominada por uma coisa só.
    const biggest = Math.max(...[...poseCounts.values(), ...intentCounts.values()]);
    const report = `${story.length} acontecimentos, ${poseCounts.size} gestos, maior repetição ${biggest}`;

    expect(story.length, `parada demais — ${report}`).toBeGreaterThan(25);
    expect(poseCounts.size, `poucos gestos — ${report}`).toBeGreaterThanOrEqual(5);
    expect(biggest / story.length, `monótona — ${report}`).toBeLessThan(0.5);
  });

  it('dá para reconhecer a personalidade só pelos gestos', () => {
    const world = makeGarden(88);
    const run = scheduler();

    // Contabiliza os gestos de cada criatura ao longo de dez minutos.
    const seen = new Map<number, Map<number, number>>();
    const previous = new Map<number, number>();

    for (let tick = 0; tick < 20 * 60 * 10; tick++) {
      run.update(world, DT);
      world.store(Behavior).forEach((behavior, entity) => {
        if (behavior.pose === POSE.none || previous.get(entity) === behavior.pose) {
          previous.set(entity, behavior.pose);
          return;
        }
        previous.set(entity, behavior.pose);
        let tally = seen.get(entity);
        if (!tally) seen.set(entity, (tally = new Map()));
        tally.set(behavior.pose, (tally.get(behavior.pose) ?? 0) + 1);
      });
    }

    // Fração dos gestos que são "descansar" (sentar ou deitar).
    const restShare = (entity: number): number => {
      const tally = seen.get(entity);
      if (!tally) return 0;
      let rest = 0;
      let total = 0;
      for (const [pose, count] of tally) {
        total += count;
        if (pose === POSE.sit || pose === POSE.lie) rest += count;
      }
      return total >= 8 ? rest / total : -1;
    };

    // Compara GRUPOS, não indivíduos: com uma criatura de cada lado o número é
    // puro ruído — quem senta 3 de 9 vezes "perde" para quem sentou 4 de 10.
    const traitsStore = world.store(Personality);
    const sample: Array<{ activity: number; rest: number }> = [];
    for (const entity of seen.keys()) {
      const traits = traitsStore.get(entity);
      const rest = restShare(entity);
      if (traits && rest >= 0) sample.push({ activity: traits.activity, rest });
    }
    sample.sort((a, b) => a.activity - b.activity);

    const third = Math.max(2, Math.floor(sample.length / 3));
    const mean = (list: typeof sample): number =>
      list.reduce((sum, item) => sum + item.rest, 0) / list.length;
    const lazyRest = mean(sample.slice(0, third));
    const busyRest = mean(sample.slice(-third));

    console.log(
      `${sample.length} criaturas observadas por 10 minutos\n` +
        `terço mais preguiçoso: descansa em ${(lazyRest * 100).toFixed(0)}% dos gestos\n` +
        `terço mais agitado:    descansa em ${(busyRest * 100).toFixed(0)}% dos gestos`,
    );

    // A personalidade tem de aparecer NO COMPORTAMENTO, não só na ficha.
    expect(sample.length, 'poucas criaturas gesticularam o bastante').toBeGreaterThanOrEqual(6);
    expect(
      lazyRest,
      `preguiçosas não descansam mais que agitadas (${lazyRest.toFixed(2)} vs ${busyRest.toFixed(2)})`,
    ).toBeGreaterThan(busyRest * 1.25);
  });
});
