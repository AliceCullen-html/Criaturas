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
}
export const Plant = defineComponent<Plant>('Plant');
