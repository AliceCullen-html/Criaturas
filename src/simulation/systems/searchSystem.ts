import { clamp01, subjects } from '@core';
import { Transform, defineResource, type System } from '@engine';
import { Emotions, Memory, Mind } from '@creatures';
import { Item } from '@world';

/**
 * Encontrar o que estava escondido.
 *
 * O jogador pode pousar um objeto atrás de uma pedra: ele continua no mundo,
 * mas sai do índice de comida — ninguém tropeça nele por acaso. A vontade de ir
 * lá ver nasce no cérebro (a opção `search`, pontuada pela curiosidade); este
 * sistema só resolve o encontro em si e a memória que ele deixa.
 */

/** Onde algo acabou de ser encontrado — o app usa para dar o sinal visual. */
export const DiscoveryResource = defineResource<Array<{ x: number; y: number }>>('Discovery');

/** A que distância a criatura efetivamente encontra o objeto. */
const FIND_RADIUS = 12;

export const searchSystem: System = {
  name: 'search',
  update(world) {
    const items = world.store(Item);
    const transforms = world.store(Transform);
    const minds = world.store(Mind);
    const emotions = world.store(Emotions);
    const memories = world.store(Memory);
    if (!world.hasResource(DiscoveryResource)) world.setResource(DiscoveryResource, []);
    const found = world.getResource(DiscoveryResource);

    items.forEach((item, itemEntity) => {
      if (!item.hidden || item.held) return;
      const spot = transforms.get(itemEntity);
      if (!spot) return;

      minds.forEach((mind, entity) => {
        if (!item.hidden) return; // já foi encontrado nesta passagem
        const transform = transforms.get(entity);
        const feel = emotions.get(entity);
        if (!transform || !feel) return;
        if (Math.hypot(transform.x - spot.x, transform.y - spot.y) > FIND_RADIUS) return;

        // Achou. A descoberta em si já é a recompensa: mata a curiosidade e
        // marca o lugar como interessante — dali em diante ela volta lá.
        item.hidden = false;
        feel.curiosity = clamp01(feel.curiosity - 0.4);
        feel.happiness = clamp01(feel.happiness + 0.2);
        mind.surprise = 1.5;
        mind.commitment = 0;

        const memory = memories.get(entity);
        if (memory) {
          memory.record(subjects.place(spot.x, spot.y), 0.6, 0.4);
          memory.addEpisode({
            text: 'Achei algo escondido aqui',
            valence: 0.7,
            intensity: 0.5,
            emotion: 'descoberta',
            tick: world.tick,
            x: spot.x,
            y: spot.y,
            actor: 'você',
          });
        }
        if (found.length < 8) found.push({ x: spot.x, y: spot.y });
      });
    });
  },
};
