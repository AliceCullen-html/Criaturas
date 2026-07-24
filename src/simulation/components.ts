import { defineComponent } from '@engine';

/** Posição no mundo (unidades de mundo). `prev*` guarda o passo anterior para interpolação. */
export interface Position {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}
export const Position = defineComponent<Position>('Position');

/** Velocidade em unidades de mundo por segundo. */
export interface Velocity {
  x: number;
  y: number;
}
export const Velocity = defineComponent<Velocity>('Velocity');

/** Aparência mínima para o render. No futuro derivada do DNA. */
export interface Renderable {
  radius: number;
  color: number;
}
export const Renderable = defineComponent<Renderable>('Renderable');
