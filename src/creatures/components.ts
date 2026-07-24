import { defineComponent } from '@engine';

export type Sex = 'M' | 'F';

/** Intenção atual da criatura — proto-FSM. Formalizado na Etapa 4 (IA). */
export type Intent = 'wander' | 'seekFood' | 'seekWater' | 'rest';

/** Marca uma entidade como criatura (para consultas e render). */
export const Creature = defineComponent<true>('Creature');

/** Necessidades, todas em 0..1. hunger/thirst: 0 = saciado, 1 = crítico. */
export interface Needs {
  hunger: number;
  thirst: number;
  energy: number;
  health: number;
  happiness: number;
}
export const Needs = defineComponent<Needs>('Needs');

/** Dados biológicos. `age`/`lifespan` em segundos de simulação. */
export interface Bio {
  sex: Sex;
  species: string;
  age: number;
  lifespan: number;
}
export const Bio = defineComponent<Bio>('Bio');

/** Fenótipo físico. Futuramente derivado do DNA (Etapa 5). */
export interface Attributes {
  speed: number;
  vision: number;
  strength: number;
  fertility: number;
  size: number;
}
export const Attributes = defineComponent<Attributes>('Attributes');

/** Aparência procedural da criatura. */
export interface Appearance {
  bodyColor: number;
  eyeColor: number;
}
export const Appearance = defineComponent<Appearance>('Appearance');

/** Identidade dada pelo jogador. */
export interface Identity {
  name: string;
}
export const Identity = defineComponent<Identity>('Identity');

/** Estado do "instinto": intenção atual e alvo de deslocamento. */
export interface Mind {
  intent: Intent;
  targetX: number;
  targetY: number;
  retarget: number;
}
export const Mind = defineComponent<Mind>('Mind');
