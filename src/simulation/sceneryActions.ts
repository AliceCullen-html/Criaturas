import { clamp01, subjects, tileColOf, tileRowOf, tileCols, tileRows } from '@core';
import { Transform, type World } from '@engine';
import { Creature, Emotions, Memory, Mind } from '@creatures';
import {
  Item,
  PropsResource,
  SceneryResource,
  TerrainResource,
  makePiece,
  placeOnTile,
  swayPropsNear,
  tileOnLand,
} from '@world';

/**
 * Arrastar o jardim.
 *
 * Até aqui o jogador podia mexer em tudo que era pequeno — frutas, gravetos,
 * pedrinhas — e nada do que era grande. Árvore e pedra eram paisagem: existiam
 * para dar sombra e fruta, e o jogador passava por elas como se fossem pintadas
 * no fundo. Agora o cenário é MOBÍLIA: pega-se, arrasta-se, larga-se numa casa
 * do tabuleiro, e o jardim vira um lugar que se arruma.
 *
 * A regra que sustenta isso é a casa. Sem ela, arrastar uma árvore só a
 * colocaria onde o dedo soltou, meio em cima da outra, e o mundo viraria uma
 * pilha. Com ela, todo movimento termina alinhado, e o mundo continua legível
 * depois de uma hora de mexida.
 */

/**
 * Acima desta velocidade o gesto foi um arremesso, não um plantio. É o mesmo
 * limiar que separa pousar de atirar em `handActions` — plantar é cuidado.
 */
const PLANT_SPEED_LIMIT = 60;

/** O que aconteceu com a peça arrastada. */
export type SceneryDropKind = 'moved' | 'blocked' | 'water' | 'none';

export interface SceneryDrop {
  kind: SceneryDropKind;
  /** Onde ela ficou (a casa nova, ou a de origem se foi recusada). */
  x: number;
  y: number;
}

/** Uma casa recebe cenário se estiver em terra e vazia. */
function tileAccepts(world: World, col: number, row: number, ignoreIndex: number): SceneryDropKind {
  const terrain = world.getResource(TerrainResource);
  const cols = tileCols(world.config.width);
  const rows = tileRows(world.config.height);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return 'blocked';
  if (!tileOnLand(terrain, col, row)) return 'water';

  const scenery = world.getResource(SceneryResource);
  for (let i = 0; i < scenery.length; i++) {
    if (i === ignoreIndex) continue;
    if (scenery[i]!.col === col && scenery[i]!.row === row) return 'blocked';
  }
  return 'moved';
}

/**
 * Larga a peça arrastada na casa sob o ponto.
 *
 * Recusada — água, borda, casa ocupada — ela **volta para onde estava**. Nunca
 * some, nunca fica no meio do lago: quem arrasta uma árvore para dentro d'água
 * vê a árvore voltar, e entende a regra sem ninguém explicar.
 */
export function dropScenery(world: World, index: number, x: number, y: number): SceneryDrop {
  const scenery = world.getResource(SceneryResource);
  const piece = scenery[index];
  if (!piece) return { kind: 'none', x: 0, y: 0 };

  const col = tileColOf(x);
  const row = tileRowOf(y);
  if (col === piece.col && row === piece.row) return { kind: 'none', x: piece.x, y: piece.y };

  const verdict = tileAccepts(world, col, row, index);
  if (verdict !== 'moved') return { kind: verdict, x: piece.x, y: piece.y };

  const fromX = piece.x;
  const fromY = piece.y;
  placeOnTile(piece, col, row);

  // O buraco que ficou e o baque na chegada mexem com o jardim dos dois lados.
  const props = world.getResource(PropsResource);
  swayPropsNear(props, fromX, fromY, 34);
  swayPropsNear(props, piece.x, piece.y, 34);

  // Pedra é pesada: chega com estrondo e assusta quem estava ali. Árvore e
  // moita chegam macias — dão curiosidade, não medo. É a mesma diferença que o
  // jogo já fazia entre afagar e bater, aplicada ao que se carrega.
  if (piece.kind === 'rock') startle(world, piece.x, piece.y, 90, 0.3);
  else notice(world, piece.x, piece.y, 120);

  return { kind: 'moved', x: piece.x, y: piece.y };
}

/**
 * Planta uma semente.
 *
 * A semente já existia no mundo como bugiganga solta — servia para chamar
 * pássaros e nada mais. Agora, pousada com cuidado numa casa vazia, ela some e
 * nasce ali uma muda. Pousada COM CUIDADO: a semente atirada continua rolando
 * pelo chão e chamando pássaros, porque plantar é um gesto, não um resultado.
 */
export function plantSeed(
  world: World,
  itemId: number,
  x: number,
  y: number,
  speed: number,
): boolean {
  const item = world.store(Item).get(itemId);
  if (!item || item.kind !== 'seed') return false;
  if (speed >= PLANT_SPEED_LIMIT) return false;

  const col = tileColOf(x);
  const row = tileRowOf(y);
  if (tileAccepts(world, col, row, -1) !== 'moved') return false;

  const scenery = world.getResource(SceneryResource);
  // Muda: variante frutífera, para a árvore que o jogador plantou ser a que
  // alimenta o jardim. Timer cheio — a primeira fruta vem depois de crescer.
  scenery.push(makePiece('tree', col, row, 2, world.rng.range(40, 90), 0.12));

  world.destroyEntity(itemId);
  notice(world, scenery[scenery.length - 1]!.x, scenery[scenery.length - 1]!.y, 110);
  return true;
}

/** Arranca a peça do tabuleiro (só usado ao desfazer, hoje). */
export function removeScenery(world: World, index: number): void {
  const scenery = world.getResource(SceneryResource);
  if (index >= 0 && index < scenery.length) scenery.splice(index, 1);
}

/** Quem estava perto olha para o que aconteceu. */
function notice(world: World, x: number, y: number, radius: number): void {
  // Num mundo sem criaturas (recém-gerado) não há a quem avisar.
  if (!world.hasComponent(Creature)) return;
  const transforms = world.store(Transform);
  const minds = world.store(Mind);
  const emotions = world.store(Emotions);
  world.store(Creature).forEach((_tag, entity) => {
    const transform = transforms.get(entity);
    const mind = minds.get(entity);
    const feel = emotions.get(entity);
    if (!transform || !mind || !feel) return;
    const distance = Math.hypot(transform.x - x, transform.y - y);
    if (distance > radius) return;
    const pull = 1 - distance / radius;
    feel.curiosity = clamp01(feel.curiosity + 0.3 * pull);
    mind.attention = Math.max(mind.attention, 2.2 * pull);
    mind.targetX = x;
    mind.targetY = y;
    mind.commitment = 0;
  });
}

/** Uma pedra caindo perto assusta — e o lugar fica marcado como ruim. */
function startle(world: World, x: number, y: number, radius: number, amount: number): void {
  if (!world.hasComponent(Creature)) return;
  const transforms = world.store(Transform);
  const minds = world.store(Mind);
  const memories = world.store(Memory);
  world.store(Emotions).forEach((emotions, entity) => {
    const transform = transforms.get(entity);
    if (!transform) return;
    const distance = Math.hypot(transform.x - x, transform.y - y);
    if (distance > radius) return;
    const force = (1 - distance / radius) * amount;
    emotions.fear = clamp01(emotions.fear + force);
    emotions.stress = clamp01(emotions.stress + force * 0.6);
    memories.get(entity)?.record(subjects.place(x, y), -0.4, force * 0.5);
    const mind = minds.get(entity);
    if (mind) {
      mind.surprise = 1.5;
      mind.commitment = 0;
    }
  });
}
