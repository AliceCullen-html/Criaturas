import { describe, it, expect } from 'vitest';
import { POSE, subjects } from '@core';
import { SystemScheduler, Transform, type World } from '@engine';
import { createUtilityBrain } from '@ai';
import { Behavior, Bio, Creature, Emotions, Memory, Mind } from '@creatures';
import { Item, TerrainResource, createWorld, isWaterAt, spawnFruit } from '@world';
import { spawnCreatures } from './spawnCreatures';
import { creatureIndexSystem } from './creatureIndex';
import { observationSystem } from './systems/observationSystem';
import { BrainResource } from './brainResource';
import { PlayerResource } from './player';
import { ChronicleResource, createChronicle } from './chronicle';
import { foodIndexSystem } from './foodIndex';
import { decisionSystem } from './systems/decisionSystem';
import { movementSystem } from './systems/movementSystem';
import { emotionSystem } from './systems/emotionSystem';
import { metabolismSystem } from './systems/metabolismSystem';
import { rewardSystem } from './systems/rewardSystem';
import { actionSystem } from './systems/actionSystem';
import { DeathsResource } from './systems/socialSystem';

/**
 * APRENDER OLHANDO.
 *
 * O medo já atravessava de um bicho para outro; o resto da vida, não. Cada
 * criatura descobria a fruta sozinha, na boca, e o que uma aprendia morria com
 * ela.
 *
 * O que se cobra aqui é a coisa mais difícil de provar num sistema emergente:
 * que o saber ATRAVESSOU, e que atravessou pelos olhos. Por isso todo teste
 * daqui tem o seu CONTROLE — a mesma cena com a testemunha longe, ou de costas
 * para o que aconteceu. Sem o controle, um número que sobe não prova nada: pode
 * ser a criatura aprendendo sozinha, que é justamente o que já existia.
 */

const CONFIG = { width: 600, height: 600 };
const DT = 1 / 20;
/** A variante de fruta usada em todas as cenas. */
const FRUTA = 0;

interface Cena {
  world: World;
  ator: number;
  testemunha: number;
}

/**
 * DUAS CRIATURAS E UMA REFEIÇÃO.
 *
 * Uma come; a outra está a `distancia` dela e olha. A cara de quem come é o
 * argumento `cara`: contente, ou com dor — é dela que sai a lição, porque é só
 * isso que se vê de fora.
 */
interface Opcoes {
  /** A que distância a testemunha está da refeição. */
  distancia: number;
  /** A cara de quem come — a ÚNICA coisa de que a lição sai. */
  cara: 'bem' | 'mal';
  /** Se a fruta é de fato venenosa. O observador não tem como saber. */
  venenosa?: boolean;
  /** Em vez de comer, está bebendo. */
  bebe?: boolean;
  /** Onde a cena acontece. */
  x?: number;
  y?: number;
  seed?: number;
}

function cena(o: Opcoes): Cena {
  const { distancia, cara, venenosa = cara === 'mal', bebe = false, seed = 4 } = o;
  const x = o.x ?? 300;
  const y = o.y ?? 300;
  const world = createWorld(CONFIG, seed);
  spawnCreatures(world, 2);
  world.setResource(BrainResource, createUtilityBrain());
  world.setResource(PlayerResource, { x: 0, y: 0, present: false });
  world.setResource(ChronicleResource, createChronicle());

  const ids: number[] = [];
  world.store(Creature).forEach((_tag, id) => ids.push(id));
  const [ator, testemunha] = ids as [number, number];

  world.store(Transform).get(ator)!.x = x;
  world.store(Transform).get(ator)!.y = y;
  world.store(Transform).get(testemunha)!.x = x + distancia;
  world.store(Transform).get(testemunha)!.y = y;

  // A REFEIÇÃO, montada à mão: a fruta existe, está na boca dela, e a pose diz
  // ao mundo o que está acontecendo. É exatamente o que o sistema de ação
  // produz — aqui só se dispensa a caminhada até a fruta.
  const fruta = spawnFruit(world, x, y, { toxic: venenosa, variant: FRUTA });
  const mindAtor = world.store(Mind).get(ator)!;
  mindAtor.targetEntity = bebe ? -1 : fruta;
  mindAtor.intent = bebe ? 'seekWater' : 'seekFood';
  const poseAtor = world.store(Behavior).get(ator)!;
  poseAtor.pose = bebe ? POSE.none : POSE.eat;
  poseAtor.duration = 999;

  // A CARA DELA. Quem come uma fruta boa fica contente; quem come veneno sente
  // dor e aperto. O sistema não sabe o que é veneno: lê o rosto.
  const feel = world.store(Emotions).get(ator)!;
  feel.happiness = cara === 'bem' ? 0.9 : 0.05;
  feel.pain = cara === 'bem' ? 0 : 0.7;
  feel.stress = cara === 'bem' ? 0.1 : 0.8;
  feel.fear = 0;

  // A testemunha começa serena e sem opinião nenhuma sobre nada.
  const dela = world.store(Emotions).get(testemunha)!;
  dela.fear = 0;
  dela.happiness = 0.5;
  world.store(Mind).get(testemunha)!.intent = 'wander';

  return { world, ator, testemunha };
}

/** Roda a cena por `segundos`, com a pose da refeição sendo reposta. */
function assistir(cena: Cena, segundos: number): void {
  const run = new SystemScheduler().add(creatureIndexSystem).add(observationSystem);
  const pose = cena.world.store(Behavior).get(cena.ator)!;
  const original = pose.pose;
  for (let tick = 0; tick < segundos / DT; tick++) {
    pose.pose = original;
    pose.elapsed = 0;
    run.update(cena.world, DT);
    cena.world.tick += 1;
  }
}

const opiniao = (world: World, id: number, sobre: string): number =>
  world.store(Memory).get(id)!.valenceOf(sobre);

describe('o que se aprende olhando os outros', () => {
  it('quem vê alguém passar mal com uma fruta passa a desconfiar dela', () => {
    const perto = cena({ distancia: 30, cara: 'mal' });
    assistir(perto, 6);
    const aprendeu = opiniao(perto.world, perto.testemunha, subjects.food(FRUTA));

    // O CONTROLE: a mesma cena, a mesma fruta, a mesma cara de dor — só que a
    // testemunha está do outro lado do jardim. Se ela aprendesse assim,
    // o que se estaria medindo não seria observação.
    const longe = cena({ distancia: 400, cara: 'mal' });
    assistir(longe, 6);
    const semVer = opiniao(longe.world, longe.testemunha, subjects.food(FRUTA));

    console.log(`vendo: ${aprendeu.toFixed(3)} · sem ver: ${semVer.toFixed(3)}`);
    expect(aprendeu, 'não aprendeu nada vendo').toBeLessThan(-0.02);
    expect(semVer, 'aprendeu sem ver — não é observação').toBe(0);

    // E ela NUNCA comeu: a opinião inteira é de segunda mão.
    const needs = perto.world.store(Bio).get(perto.testemunha);
    expect(needs, 'a testemunha sumiu').toBeTruthy();
  });

  it('e quem vê alguém se dar bem com ela passa a querer', () => {
    const boa = cena({ distancia: 30, cara: 'bem' });
    assistir(boa, 6);
    const sobre = opiniao(boa.world, boa.testemunha, subjects.food(FRUTA));
    console.log(`fruta boa vista de perto: ${sobre.toFixed(3)}`);
    expect(sobre, 'ver alguém comendo bem não ensinou nada').toBeGreaterThan(0.02);
  });

  /**
   * O ENGANO FAZ PARTE.
   *
   * A lição sai da CARA da outra, não do veneno. Uma criatura contente comendo
   * uma fruta venenosa ensina que a fruta é boa — porque foi isso que se viu.
   * Isto não é um defeito a corrigir: é de onde saem duas criaturas com
   * opiniões diferentes sobre a mesma coisa, e é o que separa aprender de
   * consultar uma tabela.
   */
  it('e aprende errado quando a cena engana', () => {
    // A FRUTA É VENENO, e a cara de quem come é de contentamento — uma cena
    // possível: o mal-estar demora, e quem passa por ali vê só a mordida.
    const enganosa = cena({ distancia: 30, cara: 'bem', venenosa: true });
    assistir(enganosa, 6);
    const sobre = opiniao(enganosa.world, enganosa.testemunha, subjects.food(FRUTA));

    // A prova de que o engano é do OBSERVADOR e não do mundo: a fruta continua
    // sendo veneno, e quem a comer vai passar mal do mesmo jeito.
    const ehVeneno = enganosa.world.store(Item).get(
      enganosa.world.store(Mind).get(enganosa.ator)!.targetEntity,
    )?.toxic;
    console.log(`fruta venenosa: ${ehVeneno} · opinião de quem viu: ${sobre.toFixed(3)}`);
    expect(ehVeneno, 'a fruta do teste não era veneno').toBe(true);
    expect(sobre, 'a lição não veio do rosto').toBeGreaterThan(0);
  });

  it('o lugar vem junto — saber o que é bom não basta, é preciso saber onde', () => {
    const perto = cena({ distancia: 30, cara: 'bem' });
    assistir(perto, 6);
    const lugar = opiniao(perto.world, perto.testemunha, subjects.place(300, 300));
    console.log(`lugar da refeição: ${lugar.toFixed(3)}`);
    expect(lugar, 'aprendeu a fruta e não o lugar').toBeGreaterThan(0.01);
  });

  it('a beira da água se aprende olhando quem bebe', () => {
    // Onde há água de verdade neste jardim. A cena precisa acontecer NA água:
    // o que se vê de fora é um bicho com a cabeça no lago, e é o lugar que
    // fica na cabeça de quem olhou.
    const mapa = createWorld(CONFIG, 4);
    const terrain = mapa.getResource(TerrainResource);
    let lago: { x: number; y: number } | null = null;
    for (let y = 20; y < CONFIG.height - 20 && !lago; y += 8) {
      for (let x = 20; x < CONFIG.width - 20 && !lago; x += 8) {
        if (isWaterAt(terrain, x, y)) lago = { x, y };
      }
    }
    expect(lago, 'este jardim não tem água').toBeTruthy();

    const bebendo = cena({ distancia: 30, cara: 'bem', bebe: true, x: lago!.x, y: lago!.y });
    assistir(bebendo, 6);
    const sabe = opiniao(bebendo.world, bebendo.testemunha, subjects.place(lago!.x, lago!.y));
    console.log(`bebedouro em (${lago!.x},${lago!.y}): ${sabe.toFixed(3)}`);
    expect(sabe, 'não aprendeu onde se bebe').toBeGreaterThan(0.01);
  });

  it('mas não inventa um bebedouro onde não há água', () => {
    // Sem pose de beber no mundo: o que se vê é um bicho parado na água. Se a
    // cena não acontecer sobre água, não há nada a aprender — e é isso que o
    // controle abaixo cobra.
    const seca = cena({ distancia: 30, cara: 'bem', bebe: true });
    assistir(seca, 6);
    const nada = opiniao(seca.world, seca.testemunha, subjects.place(300, 300));
    console.log(`bebendo em terra seca: ${nada.toFixed(3)}`);
    expect(nada, 'aprendeu um bebedouro onde não há água').toBe(0);
  });

  it('o filhote aprende muito mais depressa que o adulto', () => {
    const adulto = cena({ distancia: 30, cara: 'mal' });
    assistir(adulto, 5);
    const comoAdulto = opiniao(adulto.world, adulto.testemunha, subjects.food(FRUTA));

    const filhote = cena({ distancia: 30, cara: 'mal' });
    const bio = filhote.world.store(Bio).get(filhote.testemunha)!;
    bio.age = bio.lifespan * 0.02;
    assistir(filhote, 5);
    const comoFilhote = opiniao(filhote.world, filhote.testemunha, subjects.food(FRUTA));

    console.log(`adulto ${comoAdulto.toFixed(3)} · filhote ${comoFilhote.toFixed(3)}`);
    expect(Math.abs(comoFilhote), 'o filhote não aprendeu mais').toBeGreaterThan(
      Math.abs(comoAdulto) * 1.5,
    );
  });

  it('aprende-se mais de quem se gosta — e é daí que sai a família ensinando', () => {
    const estranho = cena({ distancia: 30, cara: 'mal' });
    assistir(estranho, 5);
    const deEstranho = opiniao(estranho.world, estranho.testemunha, subjects.food(FRUTA));

    const amiga = cena({ distancia: 30, cara: 'mal' });
    jaGostaDele(amiga);
    assistir(amiga, 5);
    const deAmiga = opiniao(amiga.world, amiga.testemunha, subjects.food(FRUTA));

    console.log(`de estranho ${deEstranho.toFixed(3)} · de quem gosta ${deAmiga.toFixed(3)}`);
    // Nada aqui diz "mãe" nem "filho": diz que se aprende mais de quem se
    // gosta. Como o filhote nasce com laço com quem o gerou e anda ao lado
    // dele, a família ensinando cai dentro desta linha sozinha.
    expect(Math.abs(deAmiga), 'o laço não mudou nada').toBeGreaterThan(Math.abs(deEstranho) * 1.2);
  });

  it('a primeira vez que um saber atravessa entra no livro', () => {
    const perto = cena({ distancia: 30, cara: 'mal' });
    assistir(perto, 20);
    const book = perto.world.getResource(ChronicleResource);
    const marcos = book.entries.filter((e) => e.landmark).map((e) => e.text);
    console.log(marcos.join('\n'));
    expect(book.seen.has('aprendeu-olhando'), 'o livro não registrou a lição').toBe(true);
  });
});

/**
 * E DEPOIS DE APRENDER, ELA VAI LÁ.
 *
 * A outra metade, e sem ela a primeira não vale nada. O jardim guardava lugares
 * bons desde sempre — a fruta que caiu ali, o esconderijo achado — e nunca ia a
 * nenhum: só o lado RUIM da lembrança era lido, para desviar do que machucou.
 * Uma criatura que só sabe de onde fugir não tem casa, e um saber sobre lugares
 * que ninguém visita não se espalha nem muda nada.
 *
 * O controle aqui é de permutação, e é o único jeito honesto de medir isto: a
 * MESMA criatura, a mesma semente, o mesmo jardim, com a lembrança em dois
 * lugares diferentes. Se ela chegar mais perto do lugar que lembra do que do
 * lugar que a outra lembra, a lembrança está puxando. Comparar com "um ponto
 * qualquer" não serviria: o bicho anda, e andar já aproxima de tudo.
 */
describe('e depois ela volta lá', () => {
  const LUGARES = [
    { x: 150, y: 150 },
    { x: 750, y: 750 },
  ] as const;

  /** Distância média até cada um dos dois cantos, ao longo de uma vida. */
  function passeio(seed: number, lembra: { x: number; y: number }): [number, number] {
    const world = createWorld({ width: 900, height: 900 }, seed);
    spawnCreatures(world, 1);
    world.setResource(BrainResource, createUtilityBrain());
    world.setResource(PlayerResource, { x: 0, y: 0, present: false });
    world.setResource(DeathsResource, []);

    let self = -1;
    world.store(Creature).forEach((_tag, id) => (self = id));
    const spot = world.store(Transform).get(self)!;
    spot.x = 450;
    spot.y = 450;
    // A LEMBRANÇA, e nada mais: nenhuma fruta ali, nenhum abrigo, nada no
    // mundo distinguindo um canto do outro. Só a opinião dela.
    world.store(Memory).get(self)!.record(subjects.place(lembra.x, lembra.y), 0.9, 1);

    const run = new SystemScheduler()
      .add(foodIndexSystem)
      .add(creatureIndexSystem)
      .add(emotionSystem)
      .add(decisionSystem)
      .add(movementSystem)
      .add(actionSystem)
      .add(metabolismSystem)
      .add(rewardSystem);

    // UMA VIDA INTEIRA, e ela acaba: doze minutos é mais do que a criatura
    // dura, e ela morre de velha no meio. Não é um recorte — é o passeio dela
    // do começo ao fim, que é a unidade certa para perguntar "onde ela viveu".
    const soma = [0, 0];
    let contas = 0;
    for (let tick = 0; tick < 20 * 60 * 12; tick++) {
      run.update(world, DT);
      world.tick += 1;
      if (tick % 20 !== 0) continue;
      const agora = world.store(Transform).get(self);
      if (!agora) break;
      soma[0]! += Math.hypot(agora.x - LUGARES[0].x, agora.y - LUGARES[0].y);
      soma[1]! += Math.hypot(agora.x - LUGARES[1].x, agora.y - LUGARES[1].y);
      contas += 1;
    }
    return contas > 0
      ? [soma[0]! / contas, soma[1]! / contas]
      : [Infinity, Infinity];
  }

  it('a lembrança de um lugar bom puxa — e é ela que puxa, não o acaso', () => {
    // DOZE JARDINS, e cada um vivido duas vezes: uma lembrando do canto de
    // cima, outra lembrando do canto de baixo. Um jardim só não bastaria — a
    // simulação é caótica, e mudar o rumo de um passeio muda toda a vida que
    // vem depois. O que se compara é a média de vinte e quatro vidas.
    const sementes = [21, 3, 77, 5, 909, 42, 1337, 7, 44, 2, 88, 13];
    let lembrado = 0;
    let outro = 0;
    for (const seed of sementes) {
      const [a0, a1] = passeio(seed, LUGARES[0]);
      const [b0, b1] = passeio(seed, LUGARES[1]);
      lembrado += a0 + b1;
      outro += a1 + b0;
    }
    const k = sementes.length * 2;
    console.log(
      `até o lugar LEMBRADO ${(lembrado / k).toFixed(0)}px · ` +
        `até o outro canto ${(outro / k).toFixed(0)}px`,
    );

    // Nada no mundo distingue os dois cantos: nem fruta, nem abrigo, nem água.
    // A única diferença entre as duas vidas é do que a criatura se lembra.
    expect(lembrado / k, 'a lembrança do lugar não puxou nada').toBeLessThan((outro / k) * 0.8);
  });
});

/** A testemunha já gosta de quem está comendo. */
function jaGostaDele(cena: Cena): void {
  cena.world.store(Memory).get(cena.testemunha)!.record(subjects.creature(cena.ator), 0.9, 1);
}
