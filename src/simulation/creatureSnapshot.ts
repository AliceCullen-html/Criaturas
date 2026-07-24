import type { World } from '@engine';
import {
  Attributes,
  Bio,
  Creature,
  Identity,
  Mind,
  Needs,
  type Intent,
  type Sex,
} from '@creatures';

/** Retrato de leitura de uma criatura para a UI (dados planos, sem o ECS). */
export interface CreatureSnapshot {
  id: number;
  name: string;
  sex: Sex;
  species: string;
  age: number;
  lifespan: number;
  intent: Intent;
  hunger: number;
  thirst: number;
  energy: number;
  health: number;
  happiness: number;
  speed: number;
  vision: number;
  strength: number;
  fertility: number;
  size: number;
}

export function readCreatureSnapshot(world: World, id: number): CreatureSnapshot | null {
  if (!world.store(Creature).has(id)) return null;
  const needs = world.store(Needs).get(id);
  const bio = world.store(Bio).get(id);
  const attributes = world.store(Attributes).get(id);
  const identity = world.store(Identity).get(id);
  const mind = world.store(Mind).get(id);
  if (!needs || !bio || !attributes || !identity || !mind) return null;

  return {
    id,
    name: identity.name,
    sex: bio.sex,
    species: bio.species,
    age: bio.age,
    lifespan: bio.lifespan,
    intent: mind.intent,
    hunger: needs.hunger,
    thirst: needs.thirst,
    energy: needs.energy,
    health: needs.health,
    happiness: needs.happiness,
    speed: attributes.speed,
    vision: attributes.vision,
    strength: attributes.strength,
    fertility: attributes.fertility,
    size: attributes.size,
  };
}
