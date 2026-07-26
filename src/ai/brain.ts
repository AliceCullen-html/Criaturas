import type { CreatureMemory } from '@core';
import type { Attributes, Emotions, Intent, Needs } from '@creatures';
import type { PersonalityTraits } from '@genetics';

/** Uma criatura vizinha, como percebida por quem decide. */
export interface PerceivedCreature {
  id: number;
  x: number;
  y: number;
  distance: number;
  size: number;
  aggression: number;
  isBaby: boolean;
  affinity: number;
  sex: 'M' | 'F';
  fertile: boolean;
}

/** Uma fonte de comida percebida. */
export interface PerceivedFood {
  id: number;
  x: number;
  y: number;
  distance: number;
  variant: number;
  /** Opinião aprendida sobre esse tipo de comida (-1 péssima … +1 ótima). */
  opinion: number;
}

/** Tudo que a criatura sabe no instante da decisão. */
export interface Perception {
  self: {
    id: number;
    x: number;
    y: number;
    age: number;
    isBaby: boolean;
    needs: Needs;
    emotions: Emotions;
    personality: PersonalityTraits;
    attributes: Attributes;
    memory: CreatureMemory;
    matingCooldown: number;
  };
  creatures: PerceivedCreature[];
  food: PerceivedFood[];
  water: { x: number; y: number } | null;
  player: { x: number; y: number; present: boolean } | null;
  placeDanger: number;
  /** Segundos restantes de atenção voltada à mão do jogador. */
  attention: number;
  /** Bichinho de ambiente mais próximo (borboleta, abelha...), se houver. */
  ambient: { x: number; y: number; distance: number } | null;
  /** Abrigo mais próximo (árvore), para se proteger da chuva. */
  shelter: { x: number; y: number; distance: number } | null;
  /** 0 = tempo bom, 1 = chovendo forte. */
  rain: number;
}

/** O que a criatura decidiu fazer. */
export interface Decision {
  intent: Intent;
  targetX: number;
  targetY: number;
  targetEntity: number;
  /** Por quanto tempo manter a decisão antes de reavaliar (segundos). */
  commitment: number;
}

/**
 * Contrato de qualquer cérebro. Trocar de implementação (utilidade → GOAP →
 * rede neural) não exige mudar nenhum sistema da simulação.
 */
export interface Brain {
  readonly name: string;
  decide(perception: Perception): Decision;
}
