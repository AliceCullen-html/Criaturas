import type { CreatureMemory } from '@core';
import { defineComponent } from '@engine';
import type { Genome, PersonalityTraits } from '@genetics';

export type Sex = 'M' | 'F';

/** O que a criatura está fazendo agora. Escolhido por pontuação, não por script. */
export type Intent =
  | 'wander'
  | 'seekFood'
  | 'seekWater'
  | 'sleep'
  | 'flee'
  | 'approachPlayer'
  | 'socialize'
  | 'play'
  | 'attack'
  | 'share'
  | 'mate';

/** Expressão visual dominante, derivada das emoções. */
export type Mood = 'neutral' | 'happy' | 'afraid' | 'sad' | 'sleeping' | 'angry';

/** Marca uma entidade como criatura. */
export const Creature = defineComponent<true>('Creature');

/** Necessidades fisiológicas, 0..1. hunger/thirst: 0 = saciado, 1 = crítico. */
export interface Needs {
  hunger: number;
  thirst: number;
  energy: number;
  health: number;
}
export const Needs = defineComponent<Needs>('Needs');

/**
 * Estado emocional, 0..1 (exibido 0–100). Muda continuamente com os
 * acontecimentos e é o principal insumo das decisões.
 */
export interface Emotions {
  happiness: number;
  fear: number;
  trust: number;
  curiosity: number;
  stress: number;
  anger: number;
  sleepiness: number;
  loneliness: number;
}
export const Emotions = defineComponent<Emotions>('Emotions');

/** Genoma bruto (herdado e mutado). */
export const CreatureGenome = defineComponent<Genome>('Genome');

/** Traços de temperamento expressos pelo genoma. */
export const Personality = defineComponent<PersonalityTraits>('Personality');

/** Dados biológicos. `age`/`lifespan` em segundos de simulação. */
export interface Bio {
  sex: Sex;
  species: string;
  age: number;
  lifespan: number;
  metabolism: number;
  matingCooldown: number;
}
export const Bio = defineComponent<Bio>('Bio');

/** Fenótipo físico. */
export interface Attributes {
  speed: number;
  vision: number;
  strength: number;
  fertility: number;
  size: number;
}
export const Attributes = defineComponent<Attributes>('Attributes');

/** Aparência procedural. `features` semeia o sprite (olhos, orelhas, manchas). */
export interface Appearance {
  bodyColor: number;
  eyeColor: number;
  features: number;
}
export const Appearance = defineComponent<Appearance>('Appearance');

/** Linhagem, para o painel e para a herança cultural. */
export interface Lineage {
  generation: number;
  parentA: string | null;
  parentB: string | null;
}
export const Lineage = defineComponent<Lineage>('Lineage');

/** Identidade dada pelo jogador. */
export interface Identity {
  name: string;
}
export const Identity = defineComponent<Identity>('Identity');

/** Memória associativa e episódica — a base do aprendizado. */
export const Memory = defineComponent<CreatureMemory>('Memory');

/** Decisão atual e alvo. `commitment` evita trocar de ideia a cada tick. */
export interface Mind {
  intent: Intent;
  mood: Mood;
  targetX: number;
  targetY: number;
  targetEntity: number;
  commitment: number;
  actionCooldown: number;
}
export const Mind = defineComponent<Mind>('Mind');
