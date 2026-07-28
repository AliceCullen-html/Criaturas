import { CreatureMemory, Lexicon } from '@core';
import { Transform, Velocity, World } from '@engine';
import { express, randomGenome, type Genome } from '@genetics';
import {
  Behavior,
  Bond,
  Nest,
  Appearance,
  Attributes,
  Bio,
  type Sex,
  Creature,
  CreatureGenome,
  Egg,
  Emotions,
  Identity,
  Lineage,
  Memory,
  Mind,
  Needs,
  Personality,
  Words,
} from './components';
import { CREATURE_NAMES } from './names';

export interface SpawnOptions {
  genome?: Genome;
  name?: string;
  generation?: number;
  parentA?: string | null;
  parentB?: string | null;
  ageFraction?: number;
  /**
   * Sexo imposto. Sem isto, sorteia macho ou fêmea — mas a espécie **começa
   * assexuada**, e o ancestral e os brotos precisam nascer `'none'`.
   */
  sex?: Sex;
  /**
   * Nasce dentro de um ovo. Quem chama decide: o jardim começa com um ovo, e
   * cada broto e cada filhote também.
   */
  asEgg?: boolean;
  /** Segundos de casca, se for ovo. */
  eggSeconds?: number;
}

/**
 * Quanto tempo um ovo leva para romper, sem ninguém esquentando.
 *
 * Perto de um minuto: tempo de o jogador reparar que há um ovo ali, chegar
 * perto e descobrir que a mão dele faz diferença. Menos que isso e o ovo é uma
 * animação de abertura; muito mais e vira uma tela de espera.
 */
export const EGG_SECONDS = 55;

/** Registra os stores dos componentes de criatura (idempotente). */
export function registerCreatureComponents(world: World): void {
  world.register(Transform);
  world.register(Velocity);
  world.register(Creature);
  world.register(Needs);
  world.register(Emotions);
  world.register(Bio);
  world.register(Attributes);
  world.register(Appearance);
  world.register(Personality);
  world.register(CreatureGenome);
  world.register(Memory);
  world.register(Lineage);
  world.register(Identity);
  world.register(Mind);
  world.register(Behavior);
  world.register(Bond);
  world.register(Nest);
  world.register(Words);
  world.register(Egg);
}

/** Cria uma criatura em (x, y), expressando o genoma dado (ou um aleatório). */
export function spawnCreature(
  world: World,
  x: number,
  y: number,
  options: SpawnOptions = {},
): number {
  const { rng } = world;
  const genome = options.genome ?? randomGenome(rng);
  const phenotype = express(genome);
  const entity = world.createEntity();

  world.store(Transform).set(entity, { x, y, prevX: x, prevY: y });
  world.store(Velocity).set(entity, { x: 0, y: 0 });
  // O ovo NÃO é marcado como criatura: é isso que o mantém fora de todos os
  // sistemas do jogo sem que nenhum deles precise saber que ovos existem.
  if (options.asEgg) {
    world
      .store(Egg)
      .set(entity, { time: 0, duration: options.eggSeconds ?? EGG_SECONDS, warmth: 0 });
  } else {
    world.store(Creature).set(entity, true);
  }
  world.store(CreatureGenome).set(entity, genome);
  world.store(Personality).set(entity, phenotype.personality);

  world.store(Needs).set(entity, {
    hunger: rng.range(0.1, 0.35),
    thirst: rng.range(0.1, 0.35),
    energy: rng.range(0.7, 1),
    health: 1,
    // Fixa, não sorteada: um sorteio a mais aqui desloca o fluxo do gerador
    // inteiro, e com ele todo mundo semeado que veio depois — quatro testes de
    // comportamento mudaram de resultado só por causa deste número.
    dirt: 0.12,
    play: 0.5,
  });

  world.store(Emotions).set(entity, {
    happiness: rng.range(0.5, 0.75),
    fear: rng.range(0.05, 0.2),
    trust: rng.range(0.1, 0.3),
    curiosity: phenotype.personality.curiosity,
    stress: rng.range(0, 0.15),
    anger: 0,
    sleepiness: rng.range(0, 0.2),
    loneliness: rng.range(0.1, 0.4),
    trauma: 0,
    scar: 0,
    pain: 0,
  });

  world.store(Bio).set(entity, {
    sex: options.sex ?? (rng.chance(0.5) ? 'M' : 'F'),
    species: phenotype.species.name,
    age: (options.ageFraction ?? rng.range(0.2, 0.5)) * phenotype.lifespan,
    lifespan: phenotype.lifespan,
    metabolism: phenotype.metabolism,
    matingCooldown: 0,
  });

  world.store(Attributes).set(entity, {
    speed: phenotype.speed,
    vision: phenotype.vision,
    strength: phenotype.strength,
    fertility: phenotype.fertility,
    size: phenotype.size,
  });

  world.store(Appearance).set(entity, {
    bodyColor: phenotype.bodyColor,
    accentColor: phenotype.accentColor,
    eyeColor: phenotype.eyeColor,
    features: phenotype.features,
    speciesIndex: phenotype.species.index,
  });

  world.store(Memory).set(entity, new CreatureMemory());
  world.store(Words).set(entity, new Lexicon());
  world.store(Lineage).set(entity, {
    generation: options.generation ?? 1,
    parentA: options.parentA ?? null,
    parentB: options.parentB ?? null,
  });
  world.store(Identity).set(entity, { name: options.name ?? rng.pick(CREATURE_NAMES) });
  world.store(Mind).set(entity, {
    intent: 'wander',
    mood: 'neutral',
    targetX: x,
    targetY: y,
    targetEntity: -1,
    commitment: 0,
    actionCooldown: 0,
    affection: 0,
    surprise: 0,
    attention: 0,
    blocked: 0,
  });

  world.store(Behavior).set(entity, {
    pose: 0,
    elapsed: 0,
    duration: 0,
    // Começam escalonadas para o jardim não gesticular tudo ao mesmo tempo.
    cooldown: rng.range(0, 12),
  });

  return entity;
}
