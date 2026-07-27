import type { System } from '@engine';
import { SceneryResource } from '../scenery';

/**
 * Quanto tempo uma muda leva para virar árvore, em segundos de simulação.
 *
 * Dois minutos e meio. Curto o bastante para quem plantou ainda estar por
 * perto quando der a primeira fruta, longo o bastante para a espera existir —
 * se fosse instantâneo, plantar seria só mais um jeito de pôr uma árvore no
 * mapa, e não uma coisa que se faz e se acompanha.
 */
const GROW_SECONDS = 150;

/** Mudas plantadas pelo jogador crescendo até virarem árvores de verdade. */
export const sceneryGrowthSystem: System = {
  name: 'sceneryGrowth',
  update(world, dt) {
    const scenery = world.getResource(SceneryResource);
    for (const piece of scenery) {
      if (piece.growth >= 1) continue;
      piece.growth = Math.min(1, piece.growth + dt / GROW_SECONDS);
    }
  },
};
