import { clamp01, subjects } from '@core';
import { Transform, type System } from '@engine';
import { Bio, Creature, Emotions, Memory, Mind, Personality } from '@creatures';
import { PlayerResource } from '../player';
import { isBaby } from '../age';

const NOTICE_RADIUS = 90;
const CLOSE_RADIUS = 34;

/**
 * As criaturas percebem a mão do jogador antes de qualquer contato: as
 * curiosas olham, as confiantes se aproximam, as assustadas recuam. É o que
 * faz o cursor parecer parte do mundo.
 */
export const handReactionSystem: System = {
  name: 'hand-reaction',
  update(world, dt) {
    const player = world.getResource(PlayerResource);
    if (!player.present) return;

    const creatures = world.store(Creature);
    const transforms = world.store(Transform);
    const emotionsStore = world.store(Emotions);
    const memories = world.store(Memory);
    const minds = world.store(Mind);
    const traitsStore = world.store(Personality);
    const bios = world.store(Bio);

    creatures.forEach((_tag, entity) => {
      const transform = transforms.get(entity);
      const emotions = emotionsStore.get(entity);
      const memory = memories.get(entity);
      const mind = minds.get(entity);
      const traits = traitsStore.get(entity);
      const bio = bios.get(entity);
      if (!transform || !emotions || !memory || !mind || !traits || !bio) return;

      const distance = Math.hypot(player.x - transform.x, player.y - transform.y);
      if (distance > NOTICE_RADIUS) return;

      const bond = memory.valenceOf(subjects.player());
      const baby = isBaby(bio);

      // Notar a mão: curiosas e filhotes reparam de longe.
      const noticeChance = (traits.curiosity * 0.6 + (baby ? 0.5 : 0.2)) * dt;
      if (mind.attention <= 0 && world.rng.chance(noticeChance)) {
        mind.attention = 1.5;
      }

      if (distance > CLOSE_RADIUS) return;

      // Perto demais: quem tem má lembrança do jogador fica tenso e se afasta.
      if (bond < -0.15 || emotions.trauma > 0.3) {
        emotions.fear = clamp01(emotions.fear + 0.25 * dt * (1 + emotions.trauma));
        emotions.stress = clamp01(emotions.stress + 0.15 * dt);
        if (mind.intent !== 'flee' && emotions.fear > 0.4) mind.commitment = 0;
      } else if (bond > 0.25) {
        // Quem confia relaxa perto da mão e busca companhia.
        emotions.loneliness = clamp01(emotions.loneliness - 0.15 * dt);
        emotions.stress = clamp01(emotions.stress - 0.08 * dt);
      }
    });
  },
};
