import { POSE, POSE_DURATION, WORD, clamp01, subjects } from '@core';
import { Transform, type World } from '@engine';
import { Behavior, Creature, Egg, Emotions, Memory, Mind, Needs } from '@creatures';
import {
  Item,
  SceneryResource,
  loose,
  maxItems,
  spawnBall,
  spawnFruit,
  spawnGift,
  type SceneryPiece,
} from '@world';
import { spawnCreature } from '@creatures';
import { chronicle } from './chronicle';
import { isBuddingPhase } from './species';
import { showAndTell } from './systems/teachingSystem';

/**
 * O QUE CADA FERRAMENTA FAZ NO MUNDO.
 *
 * Um lugar só para todas, e nenhuma delas abre nada: cada uma é um gesto que
 * termina no jardim. Sacudir a árvore derruba a fruta; largar a bola põe uma
 * bola no chão; esfregar tira a sujeira. Nenhuma pergunta, nenhuma confirmação,
 * nenhuma janela — a resposta é o mundo mudando.
 *
 * Todas devolvem o que aconteceu, porque o jogo precisa MOSTRAR: um gesto que
 * não dá em nada e não avisa parece defeito.
 */

/** Quantas bolas cabem no jardim ao mesmo tempo. */
const MAX_BALLS = 3;
/** E de presentes espalhados. Ver `placeGift`. */
const MAX_GIFTS = 6;
/** E quantos ovos podem estar chocando de uma vez. */
const MAX_EGGS = 4;
/** Teto de população: a partir daqui o jardim não aceita mais ovos. */
const MAX_POPULATION = 40;
/** Quanto de sujeira uma esfregada tira por segundo. */
const SCRUB_RATE = 0.55;
/** E o quanto ela relaxa enquanto está sendo esfregada. */
const SCRUB_CALM = 0.25;

/** A árvore está com fruta madura para cair? */
export function shakeFruitFrom(world: World, piece: SceneryPiece): number {
  if (piece.kind !== 'tree' || piece.growth < 1) return -1;
  if (loose(world) >= maxItems(world.config)) return -1;
  // Cai perto do tronco, para o lado de quem olha: fruta que cai atrás da
  // árvore fica escondida pela copa e parece que não caiu nada.
  const x = piece.x + world.rng.range(-12, 12);
  const y = piece.y + world.rng.range(6, 18);
  // A árvore fica um tempo sem dar outra: sacudir sem parar viraria uma
  // torneira de comida, e comida infinita apaga a fome do jogo.
  piece.fruitTimer = Math.max(piece.fruitTimer, 25);
  return spawnFruit(world, x, y);
}

export type FeedReply = 'given' | 'full' | 'refused';

/**
 * A MAÇÃ ATÉ A BOCA DELA.
 *
 * O cinto mostra uma maçã; encostar essa maçã na criatura tem de dar comida —
 * era o gesto mais óbvio do jogo e o único que não fazia nada: o toque virava
 * seleção e abria a ficha, que é exatamente a interface aparecendo no lugar do
 * mundo.
 *
 * A fruta cai no chão à frente dela, não dentro dela. Quem decide comer é ela:
 * pode estar sem fome, pode estar com medo de você, pode achar aquilo ruim. O
 * jogador oferece — a criatura responde. É a maçã de verdade, a mesma variante
 * que o ícone desenha, e é assim que "a comida que VOCÊ dá" vira um gosto
 * aprendido, separado do que ela cata sozinha embaixo das árvores.
 */
export function feedCreature(world: World, id: number): FeedReply {
  if (loose(world) >= maxItems(world.config)) return 'full';
  const spot = world.store(Transform).get(id);
  if (!spot) return 'full';

  // A RECUSA — o momento que faltava.
  //
  // Antes, oferecer comida a uma criatura que passou mal com aquela fruta e a
  // uma criatura sem fome dava exatamente a mesma coisa: a fruta caía no chão e
  // ela ia embora. O jogador não tinha como distinguir "não quero agora" de
  // "isso me fez mal" — e o artista tinha duas tiras desenhadas, recusar comida
  // e negar comida, sem lugar nenhum onde caber, porque não existia recusa no
  // mundo para elas desenharem.
  //
  // Dois motivos para virar a cara, e são os dois que a criatura já carregava:
  // a lembrança daquela fruta, e a lembrança de QUEM está oferecendo.
  const memory = world.store(Memory).get(id);
  const emotions = world.store(Emotions).get(id);
  const behavior = world.store(Behavior).get(id);
  const aboutFood = memory?.valenceOf(subjects.food(0)) ?? 0;
  const aboutYou = memory?.valenceOf(subjects.player()) ?? 0;
  const refuses = aboutFood < -0.25 || aboutYou < -0.4 || (emotions?.fear ?? 0) > 0.6;
  if (refuses && behavior) {
    behavior.pose = POSE.refuse;
    behavior.elapsed = 0;
    behavior.duration = POSE_DURATION[POSE.refuse] ?? 1.4;
    // E ela repara em você — é para a sua mão que ela está virando a cara.
    const mind = world.store(Mind).get(id);
    if (mind) mind.attention = Math.max(mind.attention, 2.5);
    return 'refused';
  }
  // À frente e um pouco para baixo: na projeção isométrica é onde ela enxerga,
  // e é onde a fruta não fica escondida atrás do próprio corpo dela.
  spawnFruit(world, spot.x + 9, spot.y + 9, { toxic: false, variant: 0 });
  const mind = world.store(Mind).get(id);
  // Ela repara: a mão do jogador acabou de pôr uma coisa ali.
  if (mind) mind.attention = Math.max(mind.attention, 2.5);
  return 'given';
}

export type BallReply = 'placed' | 'full';

/** Larga uma bola no chão. */
export function placeBall(world: World, x: number, y: number): BallReply {
  let balls = 0;
  world.store(Item).forEach((item) => {
    if (item.kind === 'ball') balls += 1;
  });
  if (balls >= MAX_BALLS) return 'full';
  spawnBall(world, x, y);
  chronicle(world, 'primeira-bola', 'Você largou uma bola no jardim', true);
  return 'placed';
}

/**
 * Deixa um presente sorteado no chão.
 *
 * COTA PRÓPRIA, como a bola. Antes isto disputava vaga com a fruta caída no
 * teto geral de objetos — e o jardim vive encostado nesse teto, porque as
 * árvores frutificam o tempo todo. O resultado: dar presente funcionava às
 * vezes, e quando não funcionava o jogo só piscava uma interrogação. Um gesto
 * do jogador não pode perder para o cenário se acumulando.
 *
 * Seis é uma quantidade de lembranças, não de entulho: dá para presentear cada
 * criatura de um grupo pequeno e ainda ver cada coisa individualmente no chão.
 */
export function placeGift(world: World, x: number, y: number): number {
  let gifts = 0;
  world.store(Item).forEach((item) => {
    if (item.kind === 'gift') gifts += 1;
  });
  if (gifts >= MAX_GIFTS) return -1;
  return spawnGift(world, x, y);
}

export type EggReply = 'placed' | 'crowded' | 'waiting';

/**
 * Põe um ovo no jardim.
 *
 * Com teto — dois tetos, na verdade. O jardim tem tamanho, e uma espécie que
 * se multiplica sem limite deixa de ter história: vira um formigueiro. E ovos
 * demais ao mesmo tempo transformariam o nascimento, que é o acontecimento mais
 * bonito do jogo, num chocadeiro.
 *
 * E o ovo nasce NA FASE EM QUE A ESPÉCIE ESTÁ. Sem isto, um ovo posto num jardim
 * assexuado chocava um macho ou uma fêmea — que não pode brotar, porque só quem
 * não tem sexo brota, e não pode acasalar, porque a espécie ainda não tem par. O
 * gesto de recomeçar um jardim vazio devolvia uma criatura estéril.
 */
export function placeEgg(world: World, x: number, y: number): EggReply {
  if (world.store(Creature).size >= MAX_POPULATION) return 'crowded';
  if (world.hasComponent(Egg) && world.store(Egg).size >= MAX_EGGS) return 'waiting';
  spawnCreature(world, x, y, {
    ageFraction: 0,
    asEgg: true,
    ...(isBuddingPhase(world) ? { sex: 'none' as const } : {}),
  });
  return 'placed';
}

export type ScrubReply = 'clean' | 'scrubbing' | 'refused';

/**
 * O BANHO.
 *
 * Não é um botão nem uma barra que enche: é a mão indo e voltando em cima do
 * bicho. Enquanto dura, ela relaxa e a sujeira sai; quem tem medo do jogador
 * não deixa encostar — e é o mesmo medo que rege todo o resto.
 */
export function scrub(world: World, id: number, dt: number): ScrubReply {
  const needs = world.store(Needs).get(id);
  const emotions = world.store(Emotions).get(id);
  const mind = world.store(Mind).get(id);
  const memory = world.store(Memory).get(id);
  if (!needs || !emotions || !mind || !memory) return 'refused';
  // Com medo, ninguém aceita ser esfregado.
  if (emotions.fear > 0.55 || memory.valenceOf(subjects.player()) < -0.3) {
    emotions.stress = clamp01(emotions.stress + 0.05 * dt);
    return 'refused';
  }
  if (needs.dirt <= 0.02) return 'clean';

  // TOMANDO BANHO: a pose vem do mundo, e por isso o ócio não a interrompe. É
  // a mesma ideia de comer — o desenho conta o que está acontecendo, e o que
  // está acontecendo é a sua esponja.
  const behavior = world.store(Behavior).get(id);
  if (behavior) {
    behavior.pose = POSE.bathe;
    behavior.elapsed = 0;
    behavior.duration = POSE_DURATION[POSE.bathe] ?? 0.5;
  }

  needs.dirt = clamp01(needs.dirt - SCRUB_RATE * dt);
  emotions.stress = clamp01(emotions.stress - SCRUB_CALM * dt);
  emotions.happiness = clamp01(emotions.happiness + 0.06 * dt);
  emotions.trust = clamp01(emotions.trust + 0.03 * dt);
  // Enquanto a mão trabalha, ela fica de olhos fechados, entregue.
  mind.affection = Math.max(mind.affection, 0.6);

  if (needs.dirt <= 0.02) {
    memory.record(subjects.player(), 0.6, 0.3);
    memory.addEpisode({
      text: 'Você me deu banho',
      valence: 0.7,
      intensity: 0.5,
      emotion: 'alívio',
      tick: world.tick,
      x: world.store(Transform).get(id)?.x ?? 0,
      y: world.store(Transform).get(id)?.y ?? 0,
    });
    return 'clean';
  }
  return 'scrubbing';
}

/**
 * APONTAR E DIZER O NOME.
 *
 * O livro na mão transforma um clique em aula: você toca uma coisa e a palavra
 * dela sai. Quem estiver por perto e OLHANDO aprende um pouquinho — quem estava
 * de costas, ou com fome, não aprende nada, como em todo o resto do sistema.
 *
 * Devolve quantas criaturas ouviram, para o jogo poder mostrar que a aula caiu
 * no vazio.
 */
const NAME_RANGE = 150;

export function nameThing(world: World, x: number, y: number, word: number): number {
  const transforms = world.store(Transform);
  let heard = 0;
  world.store(Creature).forEach((_tag, entity) => {
    const spot = transforms.get(entity);
    if (!spot) return;
    if (Math.hypot(spot.x - x, spot.y - y) > NAME_RANGE) return;
    // A criatura precisa estar olhando para a sua mão — e o toque no mundo
    // chama a atenção de quem está perto, então a aula funciona em sequência:
    // aponta uma vez para ela olhar, aponta de novo para ensinar.
    const mind = world.store(Mind).get(entity);
    if (!mind) return;
    if (showAndTell(world, entity, word) !== 'distracted') heard += 1;
    else mind.attention = Math.max(mind.attention, 2.5);
  });
  return heard;
}

/** A palavra que nomeia o que há naquele ponto do jardim. */
export function wordForSpot(
  world: World,
  x: number,
  y: number,
  onWater: boolean,
): { word: number; x: number; y: number } | null {
  if (onWater) return { word: WORD.water, x, y };

  // Uma coisa solta bem debaixo do dedo tem prioridade sobre o cenário: é o
  // que o jogador está apontando.
  const transforms = world.store(Transform);
  let best: { word: number; x: number; y: number } | null = null;
  let bestDistance = 30;
  world.store(Item).forEach((item, entity) => {
    const spot = transforms.get(entity);
    if (!spot) return;
    const distance = Math.hypot(spot.x - x, spot.y - y);
    if (distance > bestDistance) return;
    const word =
      item.kind === 'fruit'
        ? WORD.food
        : item.kind === 'boulder' || item.kind === 'stone'
          ? WORD.rock
          : item.kind === 'seed'
            ? WORD.tree
            : -1;
    if (word < 0) return;
    bestDistance = distance;
    best = { word, x: spot.x, y: spot.y };
  });
  if (best) return best;

  if (!world.hasResource(SceneryResource)) return null;
  for (const piece of world.getResource(SceneryResource)) {
    if (Math.hypot(piece.x - x, piece.y - y) > 34) continue;
    if (piece.kind === 'tree' || piece.kind === 'bush') return { word: WORD.tree, x, y };
    if (piece.kind === 'rock') return { word: WORD.rock, x, y };
  }
  return null;
}
