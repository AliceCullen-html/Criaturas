import { defineComponent } from '@engine';

/** Velocidade em unidades de mundo por segundo. Usada por entidades que se movem. */
export interface Velocity {
  x: number;
  y: number;
}
export const Velocity = defineComponent<Velocity>('Velocity');
