import { describe, it, expect } from 'vitest';
import { TILE, tileCenterX, tileCenterY, tileColOf, tileRowOf } from '@core';
import { SystemScheduler, Transform, type World } from '@engine';
import {
  createWorld,
  Item,
  isWaterAt,
  itemSystem,
  pieceAtTile,
  SceneryResource,
  sceneryGrowthSystem,
  spawnTrinket,
  TerrainResource,
  tileOnLand,
  type SceneryPiece,
} from '@world';
import { dropScenery, plantSeed } from './sceneryActions';

/**
 * O JARDIM COMO TABULEIRO.
 *
 * O mundo passou a ter casas, e cada árvore ou pedra ocupa uma. Isso não é
 * enfeite: é o que torna possível pegar o cenário e arrumá-lo sem que o jardim
 * vire uma pilha de sprites sobrepostos. O que se cobra aqui é a regra da casa
 * — uma peça por casa, nada dentro d'água, nada fora do mundo — e as duas
 * ações que ela habilita: arrastar e plantar.
 */

const WORLD = { width: 600, height: 600 };
const DT = 1 / 20;

const makeWorld = (seed: number): World => createWorld(WORLD, seed);

/** Uma casa vazia e em terra firme, longe da peça indicada. */
function freeTile(world: World, avoid?: SceneryPiece): { col: number; row: number } {
  const terrain = world.getResource(TerrainResource);
  const scenery = world.getResource(SceneryResource);
  for (let row = 0; row < WORLD.height / TILE; row++) {
    for (let col = 0; col < WORLD.width / TILE; col++) {
      if (!tileOnLand(terrain, col, row)) continue;
      if (pieceAtTile(scenery, col, row)) continue;
      if (avoid && Math.abs(avoid.col - col) + Math.abs(avoid.row - row) < 3) continue;
      return { col, row };
    }
  }
  throw new Error('nenhuma casa livre no jardim');
}

describe('o jardim é um tabuleiro', () => {
  it('cada árvore ou pedra ocupa uma casa inteira, e só uma', () => {
    for (const seed of [1337, 7, 99, 4242]) {
      const world = makeWorld(seed);
      const terrain = world.getResource(TerrainResource);
      const scenery = world.getResource(SceneryResource);
      expect(scenery.length, `seed ${seed}: jardim vazio`).toBeGreaterThan(8);

      const occupied = new Set<string>();
      for (const piece of scenery) {
        const key = `${piece.col},${piece.row}`;
        expect(occupied.has(key), `seed ${seed}: duas peças na casa ${key}`).toBe(false);
        occupied.add(key);

        // A posição em pixels é o centro da casa — sempre. É essa igualdade
        // que faz o desenho, o clique e a simulação concordarem sobre onde a
        // árvore está.
        expect(piece.x).toBe(tileCenterX(piece.col));
        expect(piece.y).toBe(tileCenterY(piece.row));
        expect(tileColOf(piece.x)).toBe(piece.col);
        expect(tileRowOf(piece.y)).toBe(piece.row);

        // E nunca dentro do lago, nem com um pé dentro dele.
        expect(isWaterAt(terrain, piece.x, piece.y), `seed ${seed}: peça na água`).toBe(false);
        expect(tileOnLand(terrain, piece.col, piece.row), `seed ${seed}: casa molhada`).toBe(true);
      }
    }
  });

  it('nenhuma peça encosta na outra: o jardim é plantado, não derramado', () => {
    const world = makeWorld(1337);
    const scenery = world.getResource(SceneryResource);
    for (const piece of scenery) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const neighbour = pieceAtTile(scenery, piece.col + dx, piece.row + dy);
        expect(neighbour, `parede de mata em ${piece.col},${piece.row}`).toBeNull();
      }
    }
  });
});

describe('arrastar o cenário', () => {
  it('uma pedra largada numa casa livre muda de casa', () => {
    const world = makeWorld(1337);
    const scenery = world.getResource(SceneryResource);
    const index = scenery.findIndex((piece) => piece.kind === 'rock');
    expect(index, 'este jardim não tem pedra').toBeGreaterThanOrEqual(0);

    const piece = scenery[index]!;
    const target = freeTile(world, piece);
    const drop = dropScenery(world, index, tileCenterX(target.col), tileCenterY(target.row));

    expect(drop.kind).toBe('moved');
    expect(piece.col).toBe(target.col);
    expect(piece.row).toBe(target.row);
    // Posição e casa nunca se separam.
    expect(piece.x).toBe(tileCenterX(target.col));
    expect(piece.y).toBe(tileCenterY(target.row));
  });

  it('largada em casa ocupada ou dentro do lago, ela volta para onde estava', () => {
    const world = makeWorld(1337);
    const scenery = world.getResource(SceneryResource);
    const index = scenery.findIndex((piece) => piece.kind === 'rock');
    const piece = scenery[index]!;
    const from = { col: piece.col, row: piece.row };

    // Em cima de outra peça.
    const other = scenery.find((candidate) => candidate !== piece)!;
    const onTop = dropScenery(world, index, other.x, other.y);
    expect(onTop.kind).toBe('blocked');
    expect(piece.col).toBe(from.col);
    expect(piece.row).toBe(from.row);

    // Dentro da água.
    const terrain = world.getResource(TerrainResource);
    let lake: { x: number; y: number } | null = null;
    for (let y = 5; y < WORLD.height && !lake; y += 5) {
      for (let x = 5; x < WORLD.width && !lake; x += 5) {
        if (isWaterAt(terrain, x, y)) lake = { x, y };
      }
    }
    expect(lake, 'jardim sem lago nenhum').not.toBeNull();
    const wet = dropScenery(world, index, lake!.x, lake!.y);
    expect(wet.kind).toBe('water');
    expect(piece.col).toBe(from.col);
    expect(piece.row).toBe(from.row);
  });
});

describe('plantar', () => {
  it('uma semente pousada com cuidado vira muda; atirada, continua semente', () => {
    const world = makeWorld(1337);
    const scenery = world.getResource(SceneryResource);
    const before = scenery.length;
    const target = freeTile(world);
    const x = tileCenterX(target.col);
    const y = tileCenterY(target.row);

    // Arremessada: o gesto foi outro, e a semente continua no chão.
    const thrown = spawnTrinket(world, 'seed', x, y);
    expect(plantSeed(world, thrown, x, y, 400)).toBe(false);
    expect(scenery.length).toBe(before);
    expect(world.store(Item).has(thrown)).toBe(true);
    world.destroyEntity(thrown);

    // Pousada: some da mão e nasce ali.
    const seed = spawnTrinket(world, 'seed', x, y);
    expect(plantSeed(world, seed, x, y, 3)).toBe(true);
    expect(world.store(Item).has(seed), 'a semente continuou no chão').toBe(false);
    expect(scenery.length).toBe(before + 1);

    const planted = pieceAtTile(scenery, target.col, target.row)!;
    expect(planted.kind).toBe('tree');
    expect(planted.growth, 'nasceu adulta').toBeLessThan(0.3);
  });

  it('não se planta em cima de outra árvore', () => {
    const world = makeWorld(1337);
    const scenery = world.getResource(SceneryResource);
    const occupied = scenery[0]!;
    const seed = spawnTrinket(world, 'seed', occupied.x, occupied.y);
    expect(plantSeed(world, seed, occupied.x, occupied.y, 2)).toBe(false);
    expect(world.store(Item).has(seed)).toBe(true);
  });

  it('a muda cresce, e só dá fruta depois de crescida', () => {
    const world = makeWorld(1337);
    const scenery = world.getResource(SceneryResource);
    const target = freeTile(world);
    const x = tileCenterX(target.col);
    const y = tileCenterY(target.row);
    const seed = spawnTrinket(world, 'seed', x, y);
    plantSeed(world, seed, x, y, 2);
    const sapling = pieceAtTile(scenery, target.col, target.row)!;

    // Com o relógio da fruta zerado, uma árvore feita já teria largado uma.
    // A muda não larga nada — é essa espera que dá sentido a plantar.
    sapling.fruitTimer = 0;
    const fruits = new SystemScheduler().add(itemSystem);
    const near = (): number => {
      let count = 0;
      const transforms = world.store(Transform);
      world.store(Item).forEach((item, entity) => {
        if (item.kind !== 'fruit') return;
        const spot = transforms.get(entity);
        if (spot && Math.hypot(spot.x - x, spot.y - y) < TILE * 0.7) count += 1;
      });
      return count;
    };
    const before = near();
    for (let tick = 0; tick < 40; tick++) fruits.update(world, DT);
    expect(near(), 'muda deu fruta').toBe(before);

    // Crescendo: dois minutos e meio de simulação bastam.
    const growing = new SystemScheduler().add(sceneryGrowthSystem);
    for (let tick = 0; tick < 20 * 160; tick++) growing.update(world, DT);
    expect(sapling.growth).toBe(1);

    sapling.fruitTimer = 0;
    for (let tick = 0; tick < 40; tick++) fruits.update(world, DT);
    expect(near(), 'árvore crescida não deu fruta').toBeGreaterThan(before);
  });
});
