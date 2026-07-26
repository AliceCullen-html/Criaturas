import { approach, clamp01 } from '@core';
import { type System } from '@engine';
import {
  Creature,
  Emotions,
  Memory,
  Mind,
  Needs,
  Personality,
  type Intent,
  type Mood,
} from '@creatures';

/**
 * Inércia emocional.
 *
 * Nada muda de uma hora para outra: o medo leva muito tempo para passar, a
 * tristeza demora, a felicidade escorre devagar e a confiança se constrói aos
 * poucos. O trauma quase não cede — é o que dá peso às experiências ruins.
 */
const FEAR_CALM = 0.012;
const ANGER_CALM = 0.02;
const STRESS_CALM = 0.01;
const HAPPINESS_INERTIA = 0.035;
const TRAUMA_CALM = 0.0006;
/** A dor sara sozinha: some por volta de dois minutos. */
const PAIN_HEAL = 0.009;

const SLEEP_RATE = 0.012;
const WAKE_RATE = 0.16;
const LONELINESS_RATE = 0.02;

export const emotionSystem: System = {
  name: 'emotion',
  update(world, dt) {
    const creatures = world.store(Creature);
    const emotionsStore = world.store(Emotions);
    const needsStore = world.store(Needs);
    const traitsStore = world.store(Personality);
    const minds = world.store(Mind);
    const memories = world.store(Memory);

    creatures.forEach((_tag, entity) => {
      const emotions = emotionsStore.get(entity);
      const needs = needsStore.get(entity);
      const traits = traitsStore.get(entity);
      const mind = minds.get(entity);
      if (!emotions || !needs || !traits || !mind) return;

      const sleeping = mind.intent === 'sleep';

      // A dor aguda passa em alguns minutos — o corpo sara. O que não passa
      // junto é o trauma: a marca de ter apanhado fica muito depois de parar
      // de doer.
      emotions.pain = Math.max(0, emotions.pain - PAIN_HEAL * dt);

      // O trauma sustenta um piso de medo: quem sofreu não volta ao normal.
      emotions.trauma = Math.max(0, emotions.trauma - TRAUMA_CALM * dt);
      // Doendo, o medo não cede: é difícil relaxar machucada.
      const fearFloor = Math.max(emotions.trauma * 0.45, emotions.pain * 0.5);
      emotions.fear = Math.max(
        fearFloor,
        approach(emotions.fear, fearFloor, FEAR_CALM * (0.6 + traits.bravery), dt),
      );

      emotions.anger = approach(
        emotions.anger,
        0,
        ANGER_CALM * (1.3 - traits.aggression * 0.6),
        dt,
      );
      emotions.stress = approach(emotions.stress, emotions.trauma * 0.3, STRESS_CALM, dt);

      // Trauma atrapalha o sono: descansa pior e acorda mais cansada.
      const restQuality = 1 - emotions.trauma * 0.5;
      emotions.sleepiness = clamp01(
        emotions.sleepiness +
          (sleeping ? -WAKE_RATE * restQuality : SLEEP_RATE * (1.3 - traits.activity * 0.6)) * dt,
      );

      emotions.loneliness = clamp01(
        emotions.loneliness + LONELINESS_RATE * traits.sociability * dt,
      );

      emotions.curiosity = approach(
        emotions.curiosity,
        clamp01(traits.curiosity * (1 - emotions.fear) * (1 - needs.hunger * 0.6)),
        0.05,
        dt,
      );

      // Felicidade: síntese do bem-estar, mas com inércia — não pula de valor.
      const comfort =
        (1 - needs.hunger) * 0.25 +
        (1 - needs.thirst) * 0.2 +
        needs.energy * 0.15 +
        needs.health * 0.2 +
        emotions.trust * 0.1 +
        (1 - emotions.loneliness) * 0.1;
      const distress =
        emotions.fear * 0.5 + emotions.stress * 0.4 + emotions.anger * 0.2 + emotions.trauma * 0.3;
      emotions.happiness = approach(
        emotions.happiness,
        clamp01(comfort - distress),
        HAPPINESS_INERTIA,
        dt,
      );

      mind.affection = Math.max(0, mind.affection - dt);
      mind.surprise = Math.max(0, mind.surprise - dt);
      mind.attention = Math.max(0, mind.attention - dt);

      mind.mood = pickMood(emotions, needs, mind);

      memories.get(entity)?.decay(dt);
    });
  },
};

/**
 * Ordem de prioridade: momentos marcantes vencem estados de fundo, e o que a
 * criatura está *fazendo* aparece no rosto tanto quanto o que ela sente.
 */
function pickMood(
  emotions: Emotions,
  needs: Needs,
  mind: { affection: number; surprise: number; attention: number; intent: Intent },
): Mood {
  if (mind.affection > 0) return 'loved';
  if (mind.intent === 'sleep') return 'sleepy';
  if (mind.surprise > 0) return 'surprised';
  if (emotions.fear > 0.45) return 'afraid';
  if (emotions.anger > 0.5) return 'angry';
  if (mind.intent === 'play' || mind.intent === 'mate') return 'playful';
  if (mind.intent === 'seekWater' || needs.thirst > 0.75) return 'thirsty';
  if (mind.intent === 'seekFood' || needs.hunger > 0.75) return 'hungry';
  if (mind.attention > 0) return 'curious';
  if (emotions.happiness > 0.68) return 'happy';
  if (emotions.loneliness > 0.7 && emotions.happiness < 0.55) return 'needy';
  if (emotions.happiness < 0.3 || emotions.stress > 0.55) return 'sad';
  if (emotions.sleepiness > 0.7) return 'sleepy';
  if (emotions.curiosity > 0.7) return 'curious';
  return 'neutral';
}
