import { clamp, clamp01, subjects } from '@core';
import { Transform, type System } from '@engine';
import { breed } from '@genetics';
import {
  Bio,
  Creature,
  CreatureGenome,
  Emotions,
  Identity,
  Lineage,
  Memory,
  Mind,
  Needs,
  Words,
  spawnCreature,
} from '@creatures';
import { countIn } from '@world';
import { isBaby } from '../age';
import { chronicle } from '../chronicle';

const MATING_COOLDOWN = 90;
const MATE_REACH = 16;
/** Fração das lembranças dos pais que o filhote absorve (aprendizado por observação). */
const CULTURAL_INHERITANCE = 0.45;
/** Teto de população num mundo 1000×1000 — o jardim tem limite de espaço. */
const MAX_POPULATION_BASE = 60;

interface Birth {
  x: number;
  y: number;
  genomeA: Float32Array;
  genomeB: Float32Array;
  parentA: number;
  parentB: number;
  generation: number;
  nameA: string;
  nameB: string;
}

const births: Birth[] = [];
/** Quem já acasalou neste tick — evita filhote duplicado do mesmo casal. */
const mated = new Set<number>();

/**
 * Acasalamento e nascimento. O filhote herda genes dos dois pais (com mutação)
 * e parte das memórias — é como o medo de um alimento tóxico atravessa
 * gerações sem ninguém precisar experimentá-lo de novo.
 */
export const reproductionSystem: System = {
  name: 'reproduction',
  update(world, _dt) {
    const creatures = world.store(Creature);
    if (creatures.size >= countIn(MAX_POPULATION_BASE, world.config, 24)) return;

    const transforms = world.store(Transform);
    const bios = world.store(Bio);
    const minds = world.store(Mind);
    const genomes = world.store(CreatureGenome);
    const identities = world.store(Identity);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const memories = world.store(Memory);
    const lineages = world.store(Lineage);

    births.length = 0;

    mated.clear();

    creatures.forEach((_tag, entity) => {
      const mind = minds.get(entity);
      if (!mind || mind.intent !== 'mate' || mind.targetEntity < 0) return;

      const partner = mind.targetEntity;
      // Um casal por tick, uma vez só. (Antes o desempate era "só o de menor id
      // conduz", o que exigia que os DOIS estivessem se mirando — quando só a
      // de id maior queria, não nascia nada.)
      if (mated.has(entity) || mated.has(partner)) return;

      const bioA = bios.get(entity);
      const bioB = bios.get(partner);
      const transformA = transforms.get(entity);
      const transformB = transforms.get(partner);
      const genomeA = genomes.get(entity);
      const genomeB = genomes.get(partner);
      if (!bioA || !bioB || !transformA || !transformB || !genomeA || !genomeB) return;
      if (bioA.matingCooldown > 0 || bioB.matingCooldown > 0) return;
      // Assexuadas não acasalam: elas ainda estão na fase do brotamento.
      if (bioA.sex === 'none' || bioB.sex === 'none') return;
      if (bioA.sex === bioB.sex || isBaby(bioA) || isBaby(bioB)) return;

      const distance = Math.hypot(transformB.x - transformA.x, transformB.y - transformA.y);
      if (distance > MATE_REACH) return;

      // O consentimento continua sendo dos dois — mas não precisa ser no mesmo
      // quadro. Exigir que ambos escolhessem `mate` no mesmo tick era uma
      // coincidência raríssima: quem recebe a investida só precisa estar
      // disposto, e quem está com medo ou fugindo recusa.
      const partnerMind = minds.get(partner);
      const partnerFeel = emotionsStore.get(partner);
      const partnerWilling =
        partnerMind?.intent === 'mate' ||
        (partnerMind?.intent !== 'flee' && (partnerFeel?.fear ?? 1) < 0.4);
      if (!partnerWilling) return;

      mated.add(entity);
      mated.add(partner);
      bioA.matingCooldown = MATING_COOLDOWN;
      bioB.matingCooldown = MATING_COOLDOWN;

      const lineageA = lineages.get(entity);
      const lineageB = lineages.get(partner);
      births.push({
        x: (transformA.x + transformB.x) / 2,
        y: (transformA.y + transformB.y) / 2,
        genomeA,
        genomeB,
        parentA: entity,
        parentB: partner,
        generation: Math.max(lineageA?.generation ?? 1, lineageB?.generation ?? 1) + 1,
        nameA: identities.get(entity)?.name ?? '?',
        nameB: identities.get(partner)?.name ?? '?',
      });

      for (const parent of [entity, partner]) {
        const emotions = emotionsStore.get(parent);
        if (emotions) emotions.happiness = clamp01(emotions.happiness + 0.25);
        const needs = needsStore.get(parent);
        if (needs) needs.energy = clamp01(needs.energy - 0.2);
        minds.get(parent)!.commitment = 0;
      }
    });

    for (const birth of births) {
      const childGenome = breed(birth.genomeA, birth.genomeB, world.rng);
      const child = spawnCreature(
        world,
        clamp(birth.x + world.rng.range(-8, 8), 4, world.config.width - 4),
        clamp(birth.y + world.rng.range(-8, 8), 4, world.config.height - 4),
        {
          genome: childGenome,
          generation: birth.generation,
          parentA: birth.nameA,
          parentB: birth.nameB,
          ageFraction: 0,
        },
      );

      const childName = identities.get(child)?.name ?? '?';
      chronicle(
        world,
        'primeiro-filhote',
        `Nasceu o primeiro filhote de um casal: ${childName}, de ${birth.nameA} e ${birth.nameB}`,
        true,
      );
      chronicle(world, 'nascimento', `Nasceu ${childName}, de ${birth.nameA} e ${birth.nameB}`);
      chronicle(
        world,
        `geracao-${birth.generation}`,
        `Chegou a ${birth.generation}ª geração: ${childName}`,
        true,
      );

      // Herança cultural: o filhote já nasce sabendo o que os pais aprenderam.
      //
      // Inclusive as palavras — mas pela metade, e sempre abaixo do que os pais
      // sabem. Um filhote nasce com o começo da língua da família na cabeça e
      // precisa terminar de aprendê-la ouvindo; se herdasse pronto, a segunda
      // geração já falaria tudo e ensinar deixaria de existir.
      const childWords = world.store(Words).get(child);
      if (childWords) {
        for (const parent of [birth.parentA, birth.parentB]) {
          const parentWords = world.store(Words).get(parent);
          if (parentWords) childWords.inheritFrom(parentWords, CULTURAL_INHERITANCE);
        }
      }
      const childMemory = memories.get(child);
      if (childMemory) {
        for (const parent of [birth.parentA, birth.parentB]) {
          const parentMemory = memories.get(parent);
          if (parentMemory) childMemory.inheritFrom(parentMemory, CULTURAL_INHERITANCE);
        }
        childMemory.addEpisode({
          text: `Nasci de ${birth.nameA} e ${birth.nameB}`,
          valence: 0.6,
          intensity: 1,
          emotion: 'nascimento',
          tick: world.tick,
          x: birth.x,
          y: birth.y,
        });
      }

      // Insegurança se transmite: filhote de pais traumatizados já nasce arisco.
      const childEmotions = emotionsStore.get(child);
      if (childEmotions) {
        let inherited = 0;
        for (const parent of [birth.parentA, birth.parentB]) {
          inherited = Math.max(inherited, emotionsStore.get(parent)?.trauma ?? 0);
        }
        childEmotions.trauma = clamp01(inherited * 0.5);
        childEmotions.fear = clamp01(childEmotions.fear + inherited * 0.3);
      }

      // Os pais reconhecem o filhote — e o filhote reconhece os pais, que é o
      // que faz ele seguir quem ama pelo mapa.
      for (const parent of [birth.parentA, birth.parentB]) {
        childMemory?.record(subjects.creature(parent), 1, 1);
        const parentMemory = memories.get(parent);
        parentMemory?.record(subjects.creature(child), 1, 1);
        parentMemory?.addEpisode({
          text: 'Tive um filhote',
          valence: 1,
          intensity: 1,
          emotion: 'amor',
          tick: world.tick,
          x: birth.x,
          y: birth.y,
        });
      }
    }
  },
};
