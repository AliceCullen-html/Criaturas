import { defineComponent } from './component';

/**
 * Componentes 2D genéricos do engine, compartilhados por qualquer entidade
 * (plantas, criaturas...). Ficam aqui, e não num módulo de domínio, porque
 * `world` e `creatures` são camadas irmãs que ambas precisam deles.
 */

/** Posição no mundo. `prev*` guarda o passo anterior para interpolação no render. */
export interface Transform {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}
export const Transform = defineComponent<Transform>('Transform');

/** Aparência mínima para o render (círculo). */
export interface Sprite {
  radius: number;
  color: number;
}
export const Sprite = defineComponent<Sprite>('Sprite');
