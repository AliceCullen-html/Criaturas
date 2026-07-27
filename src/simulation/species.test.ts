import { describe, it, expect } from 'vitest';
import { SystemScheduler, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Appearance, Attributes, Bio, Creature, Lineage, Personality } from '@creatures';
import {
  ambientSystem,
  createWorld,
  dayNightSystem,
  itemSystem,
  plantGrowthSystem,
  plantSpreadSystem,
  propSystem,
  weatherSystem,
} from '@world';
import { spawnCreatures } from './spawnCreatures';
import { foodIndexSystem } from './foodIndex';
import { creatureIndexSystem } from './creatureIndex';
import { emotionSystem } from './systems/emotionSystem';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { metabolismSystem } from './systems/metabolismSystem';
import { reproductionSystem } from './systems/reproductionSystem';
import { eggSystem } from './systems/eggSystem';
import { searchSystem } from './systems/searchSystem';
import { idleSystem } from './systems/idleSystem';
import { confinementSystem } from './systems/confinementSystem';
import { planSystem } from './systems/planSystem';
import { socialSystem, DeathsResource } from './systems/socialSystem';
import { buddingSystem, PHASE, SpeciesResource } from './species';
import { ChronicleResource, createChronicle, chronicle } from './chronicle';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';

/**
 * A ORIGEM DA ESPÉCIE.
 *
 * O mundo começa com UMA criatura sem sexo. Ela se duplica quando a vida está
 * boa, cada cópia sai diferente da anterior, e quando a população cruza um
 * limiar a espécie ganha machos e fêmeas.
 *
 * O que se cobra aqui é a coisa mais difícil de garantir num sistema vivo:
 * que a coisa ACONTEÇA sozinha. Um brotamento que exige condições impossíveis
 * deixa o jardim vazio para sempre; um que exige pouco enche o mundo em dez
 * segundos e a espécie deixa de ter história. O teste roda o mundo de verdade,
 * do primeiro ser vivo até a transição.
 */

const WORLD = { width: 900, height: 900 };
const DT = 1 / 20;
const THRESHOLD = 12;

function genesis(seed: number, threshold = THRESHOLD): World {
  const world = createWorld(WORLD, seed);
  spawnCreatures(world, 1, { sex: 'none', ageFraction: 0.05 });
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  world.setResource(DeathsResource, []);
  world.setResource(ChronicleResource, createChronicle());
  world.setResource(SpeciesResource, { phase: PHASE.budding, threshold, buds: 0 });
  chronicle(world, 'genesis', 'O jardim ganhou seu primeiro ser vivo', true);
  return world;
}

const scheduler = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(eggSystem)
    .add(emotionSystem)
    .add(socialSystem)
    .add(planSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(reproductionSystem)
    .add(buddingSystem)
    .add(metabolismSystem)
    .add(confinementSystem)
    .add(itemSystem)
    .add(searchSystem)
    .add(weatherSystem)
    .add(dayNightSystem)
    .add(ambientSystem)
    .add(propSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);

describe('a origem da espécie', () => {
  it('de uma criatura só nasce uma população — e leva tempo', () => {
    const world = genesis(1337, 99); // limiar alto: só nos interessa o brotar
    const run = scheduler();

    expect(world.store(Creature).size, 'o mundo não começou com uma só').toBe(1);
    let primeiroBroto = -1;
    const marcas: Array<{ minuto: number; vivos: number }> = [];

    for (let tick = 0; tick < 20 * 60 * 20; tick++) {
      run.update(world, DT);
      world.tick += 1;
      const vivos = world.store(Creature).size;
      if (primeiroBroto < 0 && vivos > 1) primeiroBroto = tick;
      if (tick % (20 * 60 * 4) === 0) marcas.push({ minuto: tick / 1200, vivos });
    }

    const vivos = world.store(Creature).size;
    console.log(
      `crescimento: ${marcas.map((m) => `${m.minuto}min=${m.vivos}`).join(' · ')} → ${vivos} em 20min`,
    );
    console.log(`primeira duplicação aos ${(primeiroBroto / 20).toFixed(0)}s`);

    expect(primeiroBroto, 'ninguém brotou em vinte minutos').toBeGreaterThan(0);
    // Nada instantâneo: a primeira duplicação custa quase um minuto de vida
    // boa, e ninguém vive bem desde o primeiro segundo.
    expect(primeiroBroto / 20, 'brotou rápido demais').toBeGreaterThan(30);
    // E cresce DEVAGAR: sem teto, o brotamento é exponencial e encheria o
    // jardim em minutos. Aos cinco minutos ainda é um punhado.
    const cincoMin = marcas.find((m) => m.minuto === 5);
    expect(cincoMin?.vivos ?? 0, 'a população explodiu').toBeLessThan(12);
    expect(vivos, 'a espécie não vingou').toBeGreaterThan(4);
  });

  it('cada duplicação sai diferente da anterior — nada de clones', () => {
    const world = genesis(7, 99);
    const run = scheduler();
    for (let tick = 0; tick < 20 * 60 * 15; tick++) {
      run.update(world, DT);
      world.tick += 1;
    }

    const cores = new Set<number>();
    const velocidades: number[] = [];
    const coragens: number[] = [];
    world.store(Creature).forEach((_tag, entity) => {
      const look = world.store(Appearance).get(entity);
      const attrs = world.store(Attributes).get(entity);
      const traits = world.store(Personality).get(entity);
      if (look) cores.add(look.features);
      if (attrs) velocidades.push(attrs.speed);
      if (traits) coragens.push(traits.bravery);
    });

    expect(velocidades.length, 'população pequena demais para comparar').toBeGreaterThan(4);
    const espalhamento = (lista: number[]): number => Math.max(...lista) - Math.min(...lista);
    console.log(
      `${velocidades.length} criaturas · velocidade varia ${espalhamento(velocidades).toFixed(1)} · ` +
        `coragem varia ${espalhamento(coragens).toFixed(2)} · ${cores.size} aparências`,
    );

    // A mutação de um genitor só é a ÚNICA fonte de diferença nesta fase.
    // Se ela falhar, a espécie inteira vira um bando de gêmeos.
    expect(espalhamento(velocidades), 'todos com a mesma velocidade').toBeGreaterThan(2);
    expect(espalhamento(coragens), 'todos com a mesma coragem').toBeGreaterThan(0.05);
    expect(cores.size, 'todos com a mesma aparência').toBeGreaterThan(1);
  });

  it('ao cruzar o limiar, a espécie ganha machos e fêmeas', () => {
    const world = genesis(99, 8);
    const run = scheduler();
    const species = world.getResource(SpeciesResource);

    let transicao = -1;
    for (let tick = 0; tick < 20 * 60 * 20 && transicao < 0; tick++) {
      run.update(world, DT);
      world.tick += 1;
      if (species.phase === PHASE.sexual) transicao = tick;
    }

    expect(transicao, 'a espécie nunca evoluiu').toBeGreaterThan(0);

    let machos = 0;
    let femeas = 0;
    let semSexo = 0;
    world.store(Creature).forEach((_tag, entity) => {
      const bio = world.store(Bio).get(entity);
      if (!bio) return;
      if (bio.sex === 'M') machos += 1;
      else if (bio.sex === 'F') femeas += 1;
      else semSexo += 1;
    });

    console.log(
      `transição aos ${(transicao / 1200).toFixed(1)}min · ${machos} machos, ${femeas} fêmeas`,
    );
    expect(semSexo, 'sobrou gente sem sexo depois da transição').toBe(0);
    expect(machos, 'nenhum macho').toBeGreaterThan(0);
    expect(femeas, 'nenhuma fêmea').toBeGreaterThan(0);
    // Alternado, não sorteado: a espécie não pode morrer por azar estatístico.
    expect(Math.abs(machos - femeas), 'sexos desequilibrados').toBeLessThanOrEqual(1);

    // E o brotamento cessa: daqui em diante é preciso ser dois.
    const antes = world.store(Creature).size;
    for (let tick = 0; tick < 20 * 60 * 3; tick++) {
      run.update(world, DT);
      world.tick += 1;
    }
    expect(world.getResource(SpeciesResource).phase).toBe(PHASE.sexual);
    console.log(`depois da transição: ${antes} → ${world.store(Creature).size}`);
  });

  it('o livro da história registra os marcos, e só uma vez cada', () => {
    const world = genesis(1337, 8);
    const run = scheduler();
    for (let tick = 0; tick < 20 * 60 * 20; tick++) {
      run.update(world, DT);
      world.tick += 1;
    }

    const book = world.getResource(ChronicleResource);
    const marcos = book.entries.filter((e) => e.landmark).map((e) => e.text);
    console.log(`livro com ${book.entries.length} entradas:\n  ` + marcos.slice(0, 8).join('\n  '));

    expect(book.seen.has('genesis'), 'não registrou o primeiro ser vivo').toBe(true);
    expect(book.seen.has('primeiro-broto'), 'não registrou a primeira duplicação').toBe(true);
    expect(book.seen.has('transicao'), 'não registrou a evolução da espécie').toBe(true);

    // Uma primeira vez é uma só. Se "a primeira duplicação" aparecesse duas
    // vezes, deixaria de ser a primeira.
    const unicos = new Set(marcos);
    expect(unicos.size, 'um marco foi registrado duas vezes').toBe(marcos.length);

    // E a linhagem avança: a segunda geração existe.
    let maiorGeracao = 0;
    world.store(Lineage).forEach((lineage) => {
      maiorGeracao = Math.max(maiorGeracao, lineage.generation);
    });
    console.log(`maior geração viva: ${maiorGeracao}`);
    expect(maiorGeracao, 'ninguém passou da primeira geração').toBeGreaterThan(1);
  });
});
