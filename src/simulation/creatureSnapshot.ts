import { subjects, type Episode } from '@core';
import type { World } from '@engine';
import { describePersonality, type PersonalityTraits } from '@genetics';
import {
  Appearance,
  Attributes,
  Bio,
  Creature,
  CreatureGenome,
  Emotions,
  Identity,
  Lineage,
  Memory,
  Mind,
  Needs,
  Personality,
  type Intent,
  type Mood,
  type Sex,
} from '@creatures';
import { isBaby } from './age';

/** Retrato de leitura de uma criatura para a UI (dados planos, sem o ECS). */
export interface CreatureSnapshot {
  id: number;
  name: string;
  sex: Sex;
  species: string;
  age: number;
  lifespan: number;
  isBaby: boolean;
  intent: Intent;
  mood: Mood;

  needs: { hunger: number; thirst: number; energy: number; health: number };
  emotions: Emotions;
  traits: PersonalityTraits;
  personality: string[];

  speed: number;
  vision: number;
  strength: number;
  fertility: number;
  size: number;

  dna: string;
  generation: number;
  parentA: string | null;
  parentB: string | null;

  /** Vínculo com o jogador: -1 (teme) … +1 (confia plenamente). */
  bond: number;
  memories: Episode[];
}

export function readCreatureSnapshot(world: World, id: number): CreatureSnapshot | null {
  if (!world.store(Creature).has(id)) return null;
  const needs = world.store(Needs).get(id);
  const emotions = world.store(Emotions).get(id);
  const bio = world.store(Bio).get(id);
  const attributes = world.store(Attributes).get(id);
  const identity = world.store(Identity).get(id);
  const mind = world.store(Mind).get(id);
  const appearance = world.store(Appearance).get(id);
  const lineage = world.store(Lineage).get(id);
  const traits = world.store(Personality).get(id);
  const memory = world.store(Memory).get(id);
  const genome = world.store(CreatureGenome).get(id);
  if (
    !needs ||
    !emotions ||
    !bio ||
    !attributes ||
    !identity ||
    !mind ||
    !appearance ||
    !lineage ||
    !traits ||
    !memory ||
    !genome
  ) {
    return null;
  }

  return {
    id,
    name: identity.name,
    sex: bio.sex,
    species: bio.species,
    age: bio.age,
    lifespan: bio.lifespan,
    isBaby: isBaby(bio),
    intent: mind.intent,
    mood: mind.mood,
    needs: { ...needs },
    emotions: { ...emotions },
    traits: { ...traits },
    personality: describePersonality(traits),
    speed: attributes.speed,
    vision: attributes.vision,
    strength: attributes.strength,
    fertility: attributes.fertility,
    size: attributes.size,
    dna: formatDna(genome),
    generation: lineage.generation,
    parentA: lineage.parentA,
    parentB: lineage.parentB,
    bond: memory.valenceOf(subjects.player()),
    memories: memory.episodes.slice(0, 6),
  };
}

/** Assinatura curta e legível do genoma, para exibição. */
function formatDna(genome: Float32Array): string {
  let out = '';
  for (let i = 0; i < genome.length; i++) {
    out += Math.round((genome[i] ?? 0) * 15)
      .toString(16)
      .toUpperCase();
  }
  return out;
}
