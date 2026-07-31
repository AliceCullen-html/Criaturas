import { describe, it, expect } from 'vitest';
import { subjects } from '@core';
import { SystemScheduler, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Bio, Creature, Emotions, Memory, Needs } from '@creatures';
import { createWorld } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { Goal, goalSystem, goalText } from './systems/goalSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';
import { ChronicleResource, createChronicle } from './chronicle';

/**
 * O QUE ELA ANDA QUERENDO DA VIDA.
 *
 * Tudo o que a criatura tinha era curto: a intenção dura segundos, a historinha
 * meio minuto, o hábito é uma média e não uma vontade. Nada durava o bastante
 * para o jogador conseguir dizer "ela está tentando alguma coisa".
 *
 * O que se cobra aqui é que o objetivo SAIA da criatura — da memória dela e do
 * que lhe falta — e não de uma lista de objetivos possíveis escrita por alguém.
 * Por isso todo teste daqui muda UMA coisa e mantém o resto: as mesmas
 * lembranças com necessidades diferentes têm de dar projetos diferentes.
 */

const CONFIG = { width: 600, height: 600 };
const DT = 1 / 20;
const LONGE = { x: 450, y: 450 };

function jardim(quantos: number, seed = 5): { world: World; ids: number[] } {
  const world = createWorld(CONFIG, seed);
  spawnCreatures(world, quantos);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  world.setResource(ChronicleResource, createChronicle());
  const ids: number[] = [];
  world.store(Creature).forEach((_tag, id) => ids.push(id));
  // Adultos: um filhote não tem projeto, e isso é testado à parte.
  for (const id of ids) {
    const bio = world.store(Bio).get(id)!;
    bio.age = bio.lifespan * 0.5;
  }
  return { world, ids };
}

/** Roda só o sistema de objetivo, tempo bastante para ele pensar. */
function pensar(world: World, segundos = 120): void {
  const run = new SystemScheduler().add(goalSystem);
  for (let tick = 0; tick < segundos / DT; tick++) {
    run.update(world, DT);
    world.tick += 1;
  }
}

const projeto = (world: World, id: number): string => world.store(Goal).get(id)?.subject ?? '';

describe('o projeto de vida sai da própria criatura', () => {
  it('sem nada de que gostar, ela não inventa um objetivo', () => {
    const { world, ids } = jardim(1);
    pensar(world);
    expect(projeto(world, ids[0]!), 'inventou um projeto do nada').toBe('');
  });

  it('e com uma boa lembrança de um lugar, passa a viver em volta dele', () => {
    const { world, ids } = jardim(1);
    world.store(Memory).get(ids[0]!)!.record(subjects.place(LONGE.x, LONGE.y), 0.9, 1);
    pensar(world);
    expect(projeto(world, ids[0]!)).toBe(subjects.place(LONGE.x, LONGE.y));
    console.log(`objetivo: ${goalText(world, ids[0]!)}`);
  });

  /**
   * O QUE FALTA PESA — e é aqui que a mesma memória dá vidas diferentes.
   *
   * Duas criaturas com EXATAMENTE as mesmas lembranças: um lugar bom e uma
   * amiga querida, nas mesmas medidas. Só muda o que está faltando. A que está
   * sozinha vai atrás de gente; a que está com fome vai atrás do lugar.
   */
  it('as mesmas lembranças com faltas diferentes dão projetos diferentes', () => {
    function comFalta(sozinha: boolean): string {
      const { world, ids } = jardim(2, 17);
      const [self, outra] = ids as [number, number];
      const memory = world.store(Memory).get(self)!;
      memory.record(subjects.place(LONGE.x, LONGE.y), 0.7, 1);
      memory.record(subjects.creature(outra), 0.7, 1);

      const feel = world.store(Emotions).get(self)!;
      const needs = world.store(Needs).get(self)!;
      feel.loneliness = sozinha ? 0.95 : 0.05;
      needs.hunger = sozinha ? 0.05 : 0.95;
      pensar(world);
      return projeto(world, self);
    }

    const daSozinha = comFalta(true);
    const daFaminta = comFalta(false);
    console.log(`sozinha → ${daSozinha} · faminta → ${daFaminta}`);
    expect(daSozinha.startsWith('creature:'), 'sozinha, não foi atrás de ninguém').toBe(true);
    expect(daFaminta.startsWith('place:'), 'faminta, não foi atrás do lugar').toBe(true);
  });

  it('custa a mudar: um pouco melhor não derruba, muito melhor derruba', () => {
    const { world, ids } = jardim(1, 23);
    const memory = world.store(Memory).get(ids[0]!)!;
    const velho = subjects.place(LONGE.x, LONGE.y);
    memory.record(velho, 0.6, 1);
    pensar(world);
    expect(projeto(world, ids[0]!)).toBe(velho);

    // Um candidato UM POUCO melhor. O que está em curso tem de aguentar.
    const quase = subjects.place(150, 150);
    memory.record(quase, 0.75, 1);
    pensar(world);
    expect(projeto(world, ids[0]!), 'trocou de projeto por um empate').toBe(velho);

    // E um MUITO melhor. Um projeto não é teimosia: ele cede ao que vale mais.
    const bem = subjects.place(150, 450);
    memory.record(bem, 1, 1);
    pensar(world);
    expect(projeto(world, ids[0]!), 'não cedeu ao que valia claramente mais').toBe(bem);
  });

  it('não se vive em volta de um fantasma: quem morreu deixa de ser projeto', () => {
    const { world, ids } = jardim(2, 31);
    const [self, amiga] = ids as [number, number];
    world.store(Memory).get(self)!.record(subjects.creature(amiga), 0.9, 1);
    world.store(Emotions).get(self)!.loneliness = 0.9;
    pensar(world);
    expect(projeto(world, self)).toBe(subjects.creature(amiga));

    world.destroyEntity(amiga);
    pensar(world);
    expect(projeto(world, self), 'continuou vivendo em volta de quem morreu').not.toBe(
      subjects.creature(amiga),
    );
  });

  it('filhote não tem projeto de vida: ele tem quem cuida dele', () => {
    const { world, ids } = jardim(1, 41);
    const bio = world.store(Bio).get(ids[0]!)!;
    bio.age = bio.lifespan * 0.03;
    world.store(Memory).get(ids[0]!)!.record(subjects.place(LONGE.x, LONGE.y), 0.9, 1);
    pensar(world);
    expect(projeto(world, ids[0]!), 'um recém-nascido com projeto de vida').toBe('');
  });
});
