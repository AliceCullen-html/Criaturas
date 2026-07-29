import { clamp01 } from '@core';
import { type System } from '@engine';
import { Carried, Emotions, Mind } from '@creatures';
import { CARRY_PATIENCE } from '../handActions';

/**
 * O TEMPO NO COLO.
 *
 * Pegar um bicho no ar é gostoso para quem pega. Para quem é pego, é gostoso
 * por uns segundos — e depois vira aflição. Um sistema de duas dúzias de linhas
 * é o que separa "o jogador pode pegar a criatura" de "o jogador pode pegar a
 * criatura, e ela tem opinião sobre isso".
 *
 * A conta é simples e a consequência é longa: passada a paciência dela, o medo
 * sobe, a confiança cai e ela se debate. Quem segura uma criatura pendurada
 * durante um minuto está fazendo uma coisa com ela, mesmo sem bater.
 */
export const carrySystem: System = {
  name: 'carry',
  update(world, dt) {
    if (!world.hasComponent(Carried)) return;
    const emotions = world.store(Emotions);
    const minds = world.store(Mind);

    world.store(Carried).forEach((carried, entity) => {
      carried.time += dt;
      const emotion = emotions.get(entity);
      const mind = minds.get(entity);
      // No ar ela não decide nada: não há para onde ir.
      if (mind) mind.commitment = 0;
      if (!emotion) return;

      if (carried.time <= CARRY_PATIENCE) {
        // Os primeiros segundos são colo: calma, se ela confia em você.
        const welcome = emotion.trust > 0.45 && emotion.scar < 0.3;
        emotion.fear = clamp01(emotion.fear - (welcome ? 0.05 : -0.02) * dt);
        emotion.happiness = clamp01(emotion.happiness + (welcome ? 0.03 : -0.02) * dt);
        return;
      }

      // Passou da conta: ela quer descer.
      emotion.fear = clamp01(emotion.fear + 0.06 * dt);
      emotion.stress = clamp01(emotion.stress + 0.09 * dt);
      emotion.trust = clamp01(emotion.trust - 0.015 * dt);
      emotion.happiness = clamp01(emotion.happiness - 0.05 * dt);
    });
  },
};
