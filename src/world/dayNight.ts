import { defineResource, type System } from '@engine';

/**
 * Ciclo dia/noite. Dá sentido ao sono que as criaturas já sentiam e traz a
 * noite — com vaga-lumes e cogumelos brilhando.
 */
export interface DayNight {
  /** 0 = meia-noite, 0.5 = meio-dia, volta a 0. */
  time: number;
  /** 0 = dia pleno, 1 = noite fechada. Derivado de `time`. */
  darkness: number;
}

export const DayNightResource = defineResource<DayNight>('DayNight');

/** Um dia inteiro leva alguns minutos de simulação. */
const DAY_LENGTH = 420;

export const createDayNight = (): DayNight => ({ time: 0.35, darkness: 0 });

export const dayNightSystem: System = {
  name: 'day-night',
  update(world, dt) {
    const cycle = world.getResource(DayNightResource);
    cycle.time = (cycle.time + dt / DAY_LENGTH) % 1;

    // Escuridão: máxima à meia-noite, nula ao meio-dia, com transições suaves.
    const noonDistance = Math.abs(cycle.time - 0.5) * 2; // 0 no meio-dia, 1 à meia-noite
    cycle.darkness = smoothstep(0.35, 0.95, noonDistance);
  },
};

export const isNight = (cycle: DayNight): boolean => cycle.darkness > 0.5;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
