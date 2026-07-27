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

const WORLD = { width: 900, height: 900 };
const DT = 1 / 20;
const OBSERVED_MINUTES = 5;

function makeGarden(seed: number): World {
  const world = createWorld(WORLD, seed);
  spawnCreatures(world, 34);
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
  /**
   * A regra do usuário diz "observar UMA criatura" — mas não diz qual, e é aí
   * que mora a diferença.
   *
   * Antes este teste seguia a primeira criatura da lista. Isso é uma loteria
   * em dois sentidos: ela pode morrer no meio dos cinco minutos (e a história
   * acaba porque a vida acabou, não porque o jogo é monótono), e ela pode ser
   * justamente a mais agitada do jardim — que POR DESENHO gesticula menos, como
   * o segundo teste desta mesma dupla faz questão de provar.
   *
   * Então observa-se TODO MUNDO, cinco minutos, e cobra-se a MEDIANA. É uma
   * exigência mais dura que a antiga, não mais frouxa: em vez de uma criatura
   * qualquer passar, metade do jardim inteiro tem de passar.
   */
  it('cinco minutos com uma criatura rendem uma história, não uma repetição', () => {
    const world = makeGarden(4242);
    const run = scheduler();

    interface Watch {
      story: string[];
      poses: Map<number, number>;
      intents: Map<string, number>;
      last: string;
    }
    const watches = new Map<number, Watch>();

    for (let tick = 0; tick < 20 * 60 * OBSERVED_MINUTES; tick++) {
      run.update(world, DT);
      world.store(Creature).forEach((_tag, entity) => {
        const mind = world.store(Mind).get(entity);
        const behavior = world.store(Behavior).get(entity);
        if (!mind || !behavior) return;

        let watch = watches.get(entity);
        if (!watch) {
          watch = { story: [], poses: new Map(), intents: new Map(), last: '' };
          watches.set(entity, watch);
        }

        // A rotina em curso tem prioridade no relato: é ela que dá o enredo.
        const plan = world.store(Plan).get(entity);
        const line =
          plan && plan.routine !== ROUTINE.none
            ? (ROUTINE_NAMES[plan.routine] ?? '?')
            : behavior.pose !== POSE.none
              ? (POSE_NAMES[behavior.pose] ?? '?')
              : (INTENT_NAMES[mind.intent] ?? mind.intent);

        if (line === watch.last) return;
        watch.story.push(`${(tick / 20).toFixed(0).padStart(3)}s  ${line}`);
        watch.last = line;
        if (behavior.pose !== POSE.none) {
          watch.poses.set(behavior.pose, (watch.poses.get(behavior.pose) ?? 0) + 1);
        } else {
          watch.intents.set(mind.intent, (watch.intents.get(mind.intent) ?? 0) + 1);
        }
      });
    }

    // Só vale quem viveu os cinco minutos inteiros — e quem não nasceu no meio
    // deles. Um filhote de dois minutos não tem cinco minutos para mostrar.
    const lived = [...watches.entries()].filter(
      ([entity, watch]) => world.store(Bio).has(entity) && watch.story.length > 0,
    );

    const measured = lived.map(([entity, watch]) => {
      const biggest = Math.max(...[...watch.poses.values(), ...watch.intents.values()], 0);
      return {
        entity,
        watch,
        events: watch.story.length,
        poses: watch.poses.size,
        monotony: watch.story.length > 0 ? biggest / watch.story.length : 1,
      };
    });

    const median = <T>(list: T[], of: (item: T) => number): number => {
      const values = list.map(of).sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)] ?? 0;
    };

    // Uma vida escolhida a dedo — a mediana em gestos — vai inteira para o log:
    // é lendo a história dela que se percebe se o jogo está vivo ou travado.
    const sample = [...measured].sort((a, b) => a.poses - b.poses)[
      Math.floor(measured.length / 2)
    ]!;
    const traits = world.store(Personality).get(sample.entity)!;
    console.log(
      `\n=== ${OBSERVED_MINUTES} minutos com ` +
        `${world.store(Identity).get(sample.entity)?.name ?? '?'} ` +
        `(a mediana de ${measured.length} criaturas) ===\n` +
        `curiosidade ${traits.curiosity.toFixed(2)} · coragem ${traits.bravery.toFixed(2)} · ` +
        `atividade ${traits.activity.toFixed(2)} · brincalhice ${traits.playfulness.toFixed(2)}\n` +
        sample.watch.story.join('\n') +
        `\n--- ${sample.events} acontecimentos, ${sample.poses} gestos diferentes ---\n`,
    );

    const events = median(measured, (m) => m.events);
    const poses = median(measured, (m) => m.poses);
    const monotony = median(measured, (m) => m.monotony);
    const report = `mediana: ${events} acontecimentos, ${poses} gestos, repetição ${(monotony * 100).toFixed(0)}%`;

    expect(measured.length, 'quase ninguém sobreviveu à observação').toBeGreaterThanOrEqual(20);
    expect(events, `paradas demais — ${report}`).toBeGreaterThan(25);
    expect(poses, `poucos gestos — ${report}`).toBeGreaterThanOrEqual(5);
    expect(monotony, `monótonas — ${report}`).toBeLessThan(0.5);
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
