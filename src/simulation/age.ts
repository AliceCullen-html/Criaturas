import type { Bio } from '@creatures';

/** Fração da vida em que a criatura ainda é filhote (menor, e protegida). */
export const BABY_FRACTION = 0.14;

export const isBaby = (bio: Bio): boolean => bio.age < bio.lifespan * BABY_FRACTION;

/** Escala de tamanho por idade: filhotes nascem pequenos e crescem. */
export function growthScale(bio: Bio): number {
  const t = Math.min(1, bio.age / (bio.lifespan * BABY_FRACTION));
  return 0.55 + 0.45 * t;
}
