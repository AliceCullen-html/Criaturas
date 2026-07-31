import { describe, it, expect } from 'vitest';
import { SystemScheduler, Velocity } from '@engine';
import { Attributes, Bio, Creature } from '@creatures';
import { createUtilityBrain } from '@ai';
import {
  ambientSystem,
  ballSystem,
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
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { actionSystem } from './systems/actionSystem';
import { metabolismSystem } from './systems/metabolismSystem';
import { emotionSystem } from './systems/emotionSystem';
import { eggSystem } from './systems/eggSystem';
import { reproductionSystem } from './systems/reproductionSystem';
import { searchSystem } from './systems/searchSystem';
import { idleSystem } from './systems/idleSystem';
import { socialSystem } from './systems/socialSystem';
import { planSystem } from './systems/planSystem';
import { teachingSystem, SpeechResource } from './systems/teachingSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';
import { ChronicleResource, createChronicle } from './chronicle';
import { isBaby } from './age';

/**
 * A PERNA CURTA E A BOCA CALADA.
 *
 * Duas queixas na mesma frase do jogador, olhando a primeira criatura do jardim:
 * *"ela nasce, anda aleatoriamente bem rápido, nem dá para interagir direito, e
 * os balões com muitas coisas estão aparecendo rápido demais"*.
 *
 * A primeira era um esquecimento simples e velho: a idade não entrava na conta
 * da velocidade em lugar nenhum. `growthScale` já dizia que um recém-nascido tem
 * 55% do tamanho adulto, e o corpo desenhado já obedecia — as pernas não. Um
 * filhote atravessava o jardim como gente grande, e o jogador não conseguia pôr
 * a mão nele.
 *
 * A segunda é o mesmo defeito da interrogação infinita, pela terceira vez: a
 * cadência da fala é POR CRIATURA e quem olha vê o JARDIM. Já tinha sido
 * corrigida no canal de falar sozinha; faltava o de ensinar — cinco segundos por
 * criatura, que num grupo de oito diante da máquina é um balão a cada meio
 * segundo sobre as mesmas cabeças.
 *
 * Os dois números aqui foram medidos antes de virarem limite.
 */

const DT = 1 / 20;

/**
 * Quantos segundos um balão fica na tela — `BUBBLE_LIFE` do renderer.
 *
 * Repetido aqui de propósito: este teste mora na simulação, e a simulação não
 * pode importar o desenho. O que atravessa é o número, e se ele mudar lá o teto
 * daqui muda junto — é a mesma conta.
 */
const BUBBLE_LIFE = 4;

const scheduler = (): SystemScheduler =>
  new SystemScheduler()
    .add(foodIndexSystem)
    .add(creatureIndexSystem)
    .add(eggSystem)
    .add(emotionSystem)
    .add(socialSystem)
    .add(teachingSystem)
    .add(planSystem)
    .add(decisionSystem)
    .add(idleSystem)
    .add(movementSystem)
    .add(actionSystem)
    .add(reproductionSystem)
    .add(metabolismSystem)
    .add(itemSystem)
    .add(ballSystem)
    .add(searchSystem)
    .add(weatherSystem)
    .add(dayNightSystem)
    .add(ambientSystem)
    .add(propSystem)
    .add(plantGrowthSystem)
    .add(plantSpreadSystem);

function garden(seed: number, quantos: number): ReturnType<typeof createWorld> {
  const world = createWorld({ width: 900, height: 900 }, seed);
  spawnCreatures(world, quantos);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 450, y: 450, present: true });
  world.setResource(SpeechResource, []);
  world.setResource(ChronicleResource, createChronicle());
  return world;
}

describe('o filhote anda como filhote', () => {
  /**
   * CADA CRIATURA É O SEU PRÓPRIO CONTROLE.
   *
   * A primeira versão desta medida comparava o filhote mais rápido do jardim com
   * o adulto mais rápido, e passava com o defeito no lugar: a velocidade é um
   * gene, os adultos são muitos e o mais veloz deles ganhava do mais veloz dos
   * filhotes por sorte de genoma, não por idade. Comparar populações diferentes
   * mede a diferença entre elas, e não a regra que se quer cobrar.
   *
   * O que se mede aqui é a velocidade de cada criatura dividida pelo gene DELA.
   * Assim o genoma sai da conta e sobra só a idade — que é exatamente a coisa
   * que não estava na conta do jogo.
   */
  it('quem acabou de sair do ovo não atravessa o jardim na velocidade de um adulto', () => {
    const world = garden(21, 12);
    const run = scheduler();

    const pontaFilhote: number[] = [];
    const pontaAdulto: number[] = [];
    const pico = new Map<number, { bebe: number; adulto: number }>();

    for (let tick = 0; tick < 20 * 60 * 5; tick++) {
      run.update(world, DT);
      world.tick += 1;
      world.store(Creature).forEach((_tag, entity) => {
        const bio = world.store(Bio).get(entity);
        const velocity = world.store(Velocity).get(entity);
        const attributes = world.store(Attributes).get(entity);
        if (!bio || !velocity || !attributes || attributes.speed <= 0) return;
        // Em fração do que as pernas DELA dariam: 1 é o passo normal, e as
        // pressas do jogo (fugir, brigar) passam disso.
        const fracao = Math.hypot(velocity.x, velocity.y) / attributes.speed;
        const seu = pico.get(entity) ?? { bebe: 0, adulto: 0 };
        if (isBaby(bio)) seu.bebe = Math.max(seu.bebe, fracao);
        else seu.adulto = Math.max(seu.adulto, fracao);
        pico.set(entity, seu);
      });
    }

    for (const { bebe, adulto } of pico.values()) {
      if (bebe > 0) pontaFilhote.push(bebe);
      if (adulto > 0) pontaAdulto.push(adulto);
    }
    const media = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const filhote = media(pontaFilhote);
    const adulto = media(pontaAdulto);
    console.log(
      `ponta em fração do próprio gene — ${pontaFilhote.length} filhotes: ` +
        `${filhote.toFixed(2)} · ${pontaAdulto.length} adultos: ${adulto.toFixed(2)}`,
    );

    expect(pontaFilhote.length, 'nenhum filhote nasceu em cinco minutos').toBeGreaterThan(2);
    expect(pontaAdulto.length, 'nenhum adulto no jardim').toBeGreaterThan(2);
    // `growthScale` vai de 0,55 a 1,0 ao longo da infância. Com a idade fora da
    // conta as duas médias empatavam; com ela dentro, a do filhote fica um
    // quarto abaixo. É essa diferença que o cursor do jogador alcança.
    expect(filhote, 'o recém-nascido continua correndo como gente grande').toBeLessThan(
      adulto * 0.88,
    );
  });
});

describe('os balões dão tempo de ler', () => {
  it('um jardim cheio não vira pisca-pisca de palavras', () => {
    const world = garden(1337, 24);
    const run = scheduler();
    const fala = world.getResource(SpeechResource);

    let balões = 0;
    const MINUTOS = 10;
    for (let tick = 0; tick < 20 * 60 * MINUTOS; tick++) {
      run.update(world, DT);
      world.tick += 1;
      balões += fala.length;
      fala.length = 0;
    }

    let vivos = 0;
    world.store(Creature).forEach(() => {
      vivos += 1;
    });
    const porSegundo = balões / (60 * MINUTOS);
    const naTela = porSegundo * BUBBLE_LIFE;
    console.log(
      `${balões} balões em ${MINUTOS} min com ${vivos} vivos · ` +
        `${porSegundo.toFixed(2)}/s · ${naTela.toFixed(1)} na tela ao mesmo tempo`,
    );

    // O LIMITE SAI DO TEMPO QUE O BALÃO FICA NA TELA, e não de um palpite. Cada
    // um dura quatro segundos, então a taxa vezes quatro é quantos o jogador vê
    // de uma vez. Com os cinco segundos de antes eram 1,03/s — mais de QUATRO
    // balões simultâneos, quase sempre sobre as mesmas cabeças do grupo diante
    // da máquina, e nenhum durando o bastante para ser lido. Três é o teto: dá
    // para varrer a tela e ler os três.
    expect(naTela, 'balões demais na tela para alguém conseguir ler').toBeLessThan(3);
    // E o silêncio total também seria defeito: elas continuam falando.
    expect(balões, 'ninguém disse nada em dez minutos').toBeGreaterThan(0);
  });
});
