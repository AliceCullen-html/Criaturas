import { TAU, clamp, clamp01, subjects } from '@core';
import { Sprite, Transform, type World } from '@engine';
import { Emotions, Identity, Memory, Mind, Needs } from '@creatures';
import { Plant, radiusForBiomass, spawnPlant } from '@world';

export type PlayerAction = 'pet' | 'feed' | 'play' | 'gift' | 'push' | 'scare' | 'hit';

interface ActionEffect {
  /** Deltas emocionais aplicados à criatura. */
  emotions: Partial<Record<keyof Emotions, number>>;
  /** Quanto a ação vale como lembrança do jogador (-1 … +1) e seu peso. */
  valence: number;
  weight: number;
  episode: string;
  hungerRelief?: number;
}

/**
 * Tabela de consequências de cada gesto do jogador. Note que gestos ruins têm
 * peso maior que os bons: a confiança é fácil de perder e lenta de reconquistar
 * — exatamente como você pediu.
 */
const EFFECTS: Record<PlayerAction, ActionEffect> = {
  pet: {
    emotions: { happiness: 0.18, trust: 0.12, stress: -0.15, fear: -0.1, loneliness: -0.3 },
    valence: 0.8,
    weight: 0.3,
    episode: 'O jogador me fez carinho',
  },
  feed: {
    emotions: { happiness: 0.15, trust: 0.14, stress: -0.1 },
    valence: 0.85,
    weight: 0.35,
    episode: 'O jogador me alimentou',
    hungerRelief: 0.25,
  },
  play: {
    emotions: { happiness: 0.25, trust: 0.1, loneliness: -0.45, sleepiness: 0.05 },
    valence: 0.8,
    weight: 0.3,
    episode: 'Brinquei com o jogador',
  },
  gift: {
    emotions: { happiness: 0.3, trust: 0.18, curiosity: 0.2 },
    valence: 0.9,
    weight: 0.4,
    episode: 'Ganhei um presente do jogador',
  },
  push: {
    emotions: { happiness: -0.12, trust: -0.15, fear: 0.2, anger: 0.2, stress: 0.2 },
    valence: -0.6,
    weight: 0.5,
    episode: 'O jogador me empurrou',
  },
  scare: {
    emotions: { fear: 0.5, stress: 0.35, trust: -0.2, happiness: -0.2 },
    valence: -0.75,
    weight: 0.6,
    episode: 'O jogador me assustou',
  },
  hit: {
    emotions: { fear: 0.7, stress: 0.5, anger: 0.4, trust: -0.4, happiness: -0.35 },
    valence: -1,
    weight: 0.9,
    episode: 'O jogador me bateu',
  },
};

const HIT_DAMAGE = 0.12;

/** Aplica um gesto do jogador a uma criatura: emoção, memória e diário. */
export function applyPlayerAction(world: World, id: number, action: PlayerAction): void {
  const emotions = world.store(Emotions).get(id);
  const memory = world.store(Memory).get(id);
  const mind = world.store(Mind).get(id);
  if (!emotions || !memory) return;

  const effect = EFFECTS[action];

  for (const [key, delta] of Object.entries(effect.emotions)) {
    const field = key as keyof Emotions;
    emotions[field] = clamp01(emotions[field] + (delta ?? 0));
  }

  memory.record(subjects.player(), effect.valence, effect.weight);
  memory.addEpisode(effect.episode, effect.valence);

  if (effect.hungerRelief) {
    const needs = world.store(Needs).get(id);
    if (needs) needs.hunger = clamp01(needs.hunger - effect.hungerRelief);
    dropTreat(world, id);
  }

  if (action === 'gift') dropTreat(world, id);

  if (action === 'hit') {
    const needs = world.store(Needs).get(id);
    if (needs) needs.health = clamp01(needs.health - HIT_DAMAGE);
    // A criatura também associa o lugar ao susto.
    const transform = world.store(Transform).get(id);
    if (transform) memory.record(subjects.place(transform.x, transform.y), -0.5, 0.4);
  }

  // Reação imediata no rosto: derreter-se de carinho ou levar um susto.
  if (mind) {
    if (action === 'pet' || action === 'gift' || action === 'play') mind.affection = 3.5;
    else if (action === 'scare' || action === 'push' || action === 'hit') mind.surprise = 2;
    // Força uma nova decisão: o gesto muda o que ela quer fazer agora.
    mind.commitment = 0;
  }
}

/** Faz nascer um alimento maduro (e seguro) ao lado da criatura. */
function dropTreat(world: World, id: number): void {
  const transform = world.store(Transform).get(id);
  if (!transform) return;

  const { rng } = world;
  const angle = rng.range(0, TAU);
  const distance = rng.range(10, 20);
  const x = clamp(transform.x + Math.cos(angle) * distance, 4, world.config.width - 4);
  const y = clamp(transform.y + Math.sin(angle) * distance, 4, world.config.height - 4);

  const plantId = spawnPlant(world, x, y);
  const plant = world.store(Plant).get(plantId);
  const sprite = world.store(Sprite).get(plantId);
  if (plant && sprite) {
    plant.biomass = plant.maxBiomass;
    plant.variant = 0; // maçã: sempre segura
    sprite.variant = 0;
    sprite.radius = radiusForBiomass(plant.biomass);
  }
}

/** Renomeia a criatura. */
export function setCreatureName(world: World, id: number, name: string): void {
  const identity = world.store(Identity).get(id);
  if (identity) identity.name = name;
}
