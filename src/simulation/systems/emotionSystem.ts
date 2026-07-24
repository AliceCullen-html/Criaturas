import { approach, clamp01 } from '@core';
import { type System } from '@engine';
import { Creature, Emotions, Memory, Mind, Needs, Personality, type Mood } from '@creatures';

const FEAR_CALM = 0.09;
const ANGER_CALM = 0.12;
const STRESS_CALM = 0.05;
const SLEEP_RATE = 0.012;
const WAKE_RATE = 0.16;
const LONELINESS_RATE = 0.02;

/**
 * Faz o estado emocional evoluir: emoções agudas (medo, raiva) esfriam com o
 * tempo, o cansaço se acumula, e a felicidade emerge do conjunto — corpo
 * satisfeito, pouco estresse e confiança alta deixam a criatura feliz.
 */
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

      // Emoções agudas voltam ao repouso; corajosas se acalmam mais rápido.
      emotions.fear = approach(emotions.fear, 0, FEAR_CALM * (0.6 + traits.bravery), dt);
      emotions.anger = approach(
        emotions.anger,
        0,
        ANGER_CALM * (1.3 - traits.aggression * 0.6),
        dt,
      );
      emotions.stress = approach(emotions.stress, 0, STRESS_CALM, dt);

      // Sono acumula acordada e some dormindo.
      emotions.sleepiness = clamp01(
        emotions.sleepiness +
          (sleeping ? -WAKE_RATE : SLEEP_RATE * (1.3 - traits.activity * 0.6)) * dt,
      );

      // Solidão cresce sozinha (o sistema social a reduz nos encontros).
      emotions.loneliness = clamp01(
        emotions.loneliness + LONELINESS_RATE * traits.sociability * dt,
      );

      // Curiosidade oscila em torno do traço, caindo sob medo ou fome.
      emotions.curiosity = approach(
        emotions.curiosity,
        clamp01(traits.curiosity * (1 - emotions.fear) * (1 - needs.hunger * 0.6)),
        0.15,
        dt,
      );

      // Felicidade: síntese do bem-estar físico e emocional.
      const comfort =
        (1 - needs.hunger) * 0.25 +
        (1 - needs.thirst) * 0.2 +
        needs.energy * 0.15 +
        needs.health * 0.2 +
        emotions.trust * 0.1 +
        (1 - emotions.loneliness) * 0.1;
      const distress = emotions.fear * 0.5 + emotions.stress * 0.4 + emotions.anger * 0.2;
      emotions.happiness = approach(emotions.happiness, clamp01(comfort - distress), 0.25, dt);

      // Expressão dominante, consumida pelo render.
      mind.mood = pickMood(sleeping, emotions);

      memories.get(entity)?.decay(dt);
    });
  },
};

function pickMood(sleeping: boolean, emotions: Emotions): Mood {
  if (sleeping) return 'sleeping';
  if (emotions.fear > 0.45) return 'afraid';
  if (emotions.anger > 0.5) return 'angry';
  if (emotions.happiness > 0.68) return 'happy';
  if (emotions.happiness < 0.3 || emotions.stress > 0.55) return 'sad';
  return 'neutral';
}
