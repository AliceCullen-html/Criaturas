import { clamp01 } from '@core';
import { Transform, defineComponent, defineResource, type System, type World } from '@engine';
import { mutate } from '@genetics';
import {
  Bio,
  Creature,
  CreatureGenome,
  Emotions,
  Identity,
  Lineage,
  Memory,
  Needs,
  Words,
  spawnCreature,
} from '@creatures';
import { countIn } from '@world';
import { chronicle } from './chronicle';

/**
 * A ORIGEM DA ESPÉCIE.
 *
 * O mundo não começa com uma população: começa com **uma criatura**. Ela não
 * tem sexo, não tem par e não tem história — é o primeiro ser vivo daquele
 * jardim. Se ela morrer antes de brotar, a espécie acaba ali.
 *
 * Estando saudável, alimentada, tranquila e segura por tempo suficiente, ela se
 * **duplica**. A cópia não é uma cópia: o genoma passa por mutação, e daí saem
 * cor, tamanho, metabolismo, coragem, curiosidade, inteligência e velocidade
 * diferentes. A população cresce devagar, e cada indivíduo já nasce distinto do
 * que o gerou.
 *
 * Quando a população cruza um limiar, a espécie **muda de fase**: aparecem
 * machos e fêmeas, o brotamento cessa e a reprodução passa a exigir duas
 * criaturas que se escolham. Não é um botão nem um desbloqueio — é o mesmo
 * mundo continuando, e por isso o momento fica registrado no livro da história
 * como um acontecimento, não como uma tela.
 *
 * A condição para brotar não é um relógio: é uma qualidade de vida SUSTENTADA.
 * Uma criatura com fome, com medo ou machucada não brota, e o progresso que ela
 * tinha regride. É isso que amarra a demografia ao cuidado — o jardim cresce
 * quando o jardim está bom.
 */

/** Fase em que a espécie está. */
export const PHASE = {
  /** Uma só linhagem, duplicando-se. */
  budding: 0,
  /** Machos e fêmeas, casais, filhotes. */
  sexual: 1,
} as const;

export interface SpeciesState {
  phase: number;
  /** População a partir da qual a espécie muda de fase. */
  threshold: number;
  /** Quantas duplicações já aconteceram. */
  buds: number;
}

export const SpeciesResource = defineResource<SpeciesState>('Species');

/** Progresso de brotamento de uma criatura assexuada. */
export interface Budding {
  /** Segundos de vida boa acumulados. Regride quando a vida piora. */
  progress: number;
  /** Espera depois de brotar: duplicar cansa. */
  cooldown: number;
}
export const Budding = defineComponent<Budding>('Budding');

/**
 * Quanto tempo de vida boa é preciso para brotar.
 *
 * Quarenta e cinco segundos SUSTENTADOS — que na prática são bem mais, porque
 * qualquer sobressalto devolve parte do caminho. "Nada deve parecer
 * instantâneo": uma duplicação precisa ser um acontecimento, não um tique.
 */
const BUD_TIME = 45;
/** Descanso depois de brotar. */
const BUD_REST = 60;
/**
 * O quanto o progresso regride por segundo quando a vida piora.
 *
 * Metade do ganho, não o dobro. A primeira versão zerava quase tudo a cada
 * aperto de sede, e como a criatura vive num ciclo permanente de comer e beber
 * — medido: fome e sede sobem de zero ao limite em pouco mais de um minuto —,
 * ela NUNCA brotava. A vida de um bicho não é uma linha reta de bem-estar; o
 * que conta é a maré, não a onda.
 */
const BUD_DECAY = 0.5;

/**
 * O que conta como "vida boa" — todas as condições ao mesmo tempo.
 *
 * Os limites de fome e sede são generosos de propósito: a régua é "não está
 * passando necessidade", não "está de barriga cheia neste instante". Com 0,45
 * a janela era estreita demais para caber num ciclo metabólico inteiro.
 */
const WELL_FED = 0.55;
const WATERED = 0.55;
const HEALTHY = 0.8;
const CALM = 0.3;
const CONTENT = 0.45;

/** Teto de população num mundo 1000×1000, o mesmo que vale para os casais. */
const MAX_POPULATION_BASE = 60;

/** Onde o broto aparece: coladinho, mas não em cima. */
const BUD_DISTANCE = 14;

export const buddingSystem: System = {
  name: 'budding',
  update(world, dt) {
    if (!world.hasResource(SpeciesResource)) return;
    const species = world.getResource(SpeciesResource);

    const creatures = world.store(Creature);
    const bios = world.store(Bio);

    // A espécie pode acabar. Começar com uma criatura só é assumir isso: se ela
    // morrer antes de brotar, ou se a linhagem não vingar, o jardim fica vazio.
    // O fim entra no livro como qualquer outro acontecimento — é o último.
    if (creatures.size === 0) {
      chronicle(world, 'extincao', 'A espécie se extinguiu. O jardim ficou vazio.', true);
      return;
    }

    // ---- A TRANSIÇÃO ----------------------------------------------------
    // Cruzou o limiar: a espécie ganha sexos. Quem já estava vivo muda junto —
    // é a mesma geração atravessando a mudança, não uma troca de elenco.
    if (species.phase === PHASE.budding && creatures.size >= species.threshold) {
      species.phase = PHASE.sexual;
      let machos = 0;
      let femeas = 0;
      creatures.forEach((_tag, entity) => {
        const bio = bios.get(entity);
        if (!bio || bio.sex !== 'none') return;
        // Alterna em vez de sortear: um mundo que sorteia 30 sexos pode dar
        // 26 fêmeas e 4 machos, e a espécie que acabou de evoluir morre por
        // azar estatístico no primeiro minuto.
        const sex = machos <= femeas ? 'M' : 'F';
        bio.sex = sex;
        if (sex === 'M') machos += 1;
        else femeas += 1;
      });
      chronicle(
        world,
        'transicao',
        `A espécie mudou: de ${creatures.size} iguais surgiram machos e fêmeas`,
        true,
      );
      return;
    }

    if (species.phase !== PHASE.budding) return;
    // O jardim tem tamanho. Sem teto, a duplicação é exponencial e o mundo
    // vira um formigueiro antes de a espécie chegar a evoluir.
    if (creatures.size >= countIn(MAX_POPULATION_BASE, world.config, 24)) return;

    // ---- O BROTAMENTO ---------------------------------------------------
    const budding = world.store(Budding);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const transforms = world.store(Transform);
    const genomes = world.store(CreatureGenome);
    const identities = world.store(Identity);
    const lineages = world.store(Lineage);
    const memories = world.store(Memory);

    const ready: number[] = [];

    creatures.forEach((_tag, self) => {
      const bio = bios.get(self);
      const needs = needsStore.get(self);
      const emotions = emotionsStore.get(self);
      if (!bio || !needs || !emotions || bio.sex !== 'none') return;

      let state = budding.get(self);
      if (!state) {
        state = { progress: 0, cooldown: 0 };
        budding.set(self, state);
      }
      if (state.cooldown > 0) {
        state.cooldown -= dt;
        return;
      }

      const wellLived =
        needs.hunger < WELL_FED &&
        needs.thirst < WATERED &&
        needs.health > HEALTHY &&
        emotions.fear < CALM &&
        emotions.pain < 0.1 &&
        emotions.happiness > CONTENT;

      // A vida boa soma; a ruim devolve o caminho andado.
      state.progress = Math.max(0, state.progress + (wellLived ? dt : -BUD_DECAY * dt));
      if (state.progress >= BUD_TIME) ready.push(self);
    });

    // A duplicação em si acontece fora da varredura: criar entidades no meio
    // de um `forEach` sobre o mesmo armazém é pedir para o índice se perder.
    for (const parent of ready) {
      const state = budding.get(parent);
      const here = transforms.get(parent);
      const genome = genomes.get(parent);
      const needs = needsStore.get(parent);
      if (!state || !here || !genome || !needs) continue;

      const angle = world.rng.range(0, Math.PI * 2);
      const child = spawnCreature(
        world,
        here.x + Math.cos(angle) * BUD_DISTANCE,
        here.y + Math.sin(angle) * BUD_DISTANCE,
        // Mutação de um genitor só: é o mesmo DNA com um empurrão.
        { genome: mutate(genome, world.rng), ageFraction: 0 },
      );

      const childBio = bios.get(child);
      if (childBio) childBio.sex = 'none';

      // Linhagem: o broto é filho de um só, e a geração avança.
      const parentLineage = lineages.get(parent);
      const parentName = identities.get(parent)?.name ?? '?';
      const childLineage = lineages.get(child);
      if (childLineage) {
        childLineage.generation = (parentLineage?.generation ?? 1) + 1;
        childLineage.parentA = parentName;
        childLineage.parentB = null;
      }

      // O broto herda parte do que o genitor sabe. É a única forma de o
      // conhecimento atravessar as gerações antes de existir linguagem.
      const parentMemory = memories.get(parent);
      const childMemory = memories.get(child);
      if (parentMemory && childMemory) childMemory.inheritFrom(parentMemory, 0.5);

      // E as palavras que o genitor aprendeu, pela metade. Numa espécie que se
      // duplica, é o único caminho da língua entre as gerações.
      const parentWords = world.store(Words).get(parent);
      const childWords = world.store(Words).get(child);
      if (parentWords && childWords) childWords.inheritFrom(parentWords, 0.5);

      // Duplicar custa: ela sai faminta, cansada e precisa de um tempo.
      needs.hunger = clamp01(needs.hunger + 0.3);
      needs.energy = clamp01(needs.energy - 0.35);
      state.progress = 0;
      state.cooldown = BUD_REST;

      species.buds += 1;
      const childName = identities.get(child)?.name ?? '?';
      chronicle(
        world,
        species.buds === 1 ? 'primeiro-broto' : `broto-${species.buds}`,
        species.buds === 1
          ? `${parentName} se duplicou pela primeira vez — nasceu ${childName}`
          : `${parentName} se duplicou: nasceu ${childName}`,
        species.buds === 1,
      );
    }
  },
};

/** A espécie ainda está na fase de duplicação? */
export const isBuddingPhase = (world: World): boolean =>
  world.hasResource(SpeciesResource) && world.getResource(SpeciesResource).phase === PHASE.budding;
