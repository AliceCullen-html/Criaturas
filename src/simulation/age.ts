import type { Bio } from '@creatures';

/** Fração da vida em que a criatura ainda é filhote (menor, e protegida). */
export const BABY_FRACTION = 0.14;

export const isBaby = (bio: Bio): boolean => bio.age < bio.lifespan * BABY_FRACTION;

/** A partir daqui a criatura é considerada idosa. */
export const ELDER_FRACTION = 0.75;

export const isElder = (bio: Bio): boolean => bio.age > bio.lifespan * ELDER_FRACTION;

/** 0 = filhote, 1 = adulto, 2 = idoso. */
export function lifeStage(bio: Bio): 0 | 1 | 2 {
  if (isBaby(bio)) return 0;
  return isElder(bio) ? 2 : 1;
}

/** Escala de tamanho por idade: filhotes nascem pequenos e crescem. */
export function growthScale(bio: Bio): number {
  const t = Math.min(1, bio.age / (bio.lifespan * BABY_FRACTION));
  return 0.55 + 0.45 * t;
}
