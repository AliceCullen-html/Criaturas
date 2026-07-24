import { defineComponent } from '@engine';

/**
 * Planta: fonte de comida renovável. A biomassa cresce até `maxBiomass` e é
 * consumida quando comida (a partir da Etapa 3). O raio do `Sprite` reflete a
 * biomassa atual.
 */
export interface Plant {
  biomass: number;
  maxBiomass: number;
  growthRate: number;
  /** Variante visual (maçã, cogumelo, flor...). Define também se é tóxica. */
  variant: number;
}
export const Plant = defineComponent<Plant>('Plant');

/** Variantes tóxicas: comê-las causa mal-estar — e a criatura aprende a evitá-las. */
const TOXIC_VARIANTS = new Set([2, 4]);

export const isToxicVariant = (variant: number): boolean => TOXIC_VARIANTS.has(variant);
