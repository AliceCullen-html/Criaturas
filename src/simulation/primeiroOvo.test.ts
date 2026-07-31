import { describe, it, expect } from 'vitest';
import { Transform } from '@engine';
import { Creature, Egg } from '@creatures';
import { createWorld, SceneryResource, tileAt, type SceneryPiece } from '@world';
import { spawnCreatures } from './spawnCreatures';

/**
 * O COMEÇO DO JOGO.
 *
 * A primeira coisa que o jogador vê não é uma criatura andando: é uma casca
 * parada no chão, e a câmera apontada para ela. Isso só funciona se a casca
 * estiver À VISTA — e não estava. A conta que escolhia o chão olhava a água e
 * as pedras grandes e ignorava as árvores, que são a coisa mais alta e mais
 * larga do jardim.
 *
 * O jogador contou o que isso virava na prática: "tenho que tirar uma árvore da
 * frente do ovo para chocar ele". Medido nas oito sementes de teste, em cinco
 * delas — a do jogo inclusive — havia cenário desenhado por cima da casca.
 */

const MUNDO = { width: 900, height: 900 };
/** As mesmas sementes de sempre, mais a do jogo. */
const SEMENTES = [1337, 7, 44, 2, 88, 13, 99, 404];
/** Quão longe da borda o ovo tem de nascer. */
const MARGEM = 90;

/** O jardim como o jogo o abre: um ovo, e mais nada. */
function abertura(seed: number): { x: number; y: number; scenery: SceneryPiece[] } {
  const world = createWorld(MUNDO, seed);
  spawnCreatures(world, 1, { sex: 'none', ageFraction: 0.05, asEgg: true });
  let ovo = -1;
  world.store(Egg).forEach((_egg, id) => (ovo = id));
  const spot = world.store(Transform).get(ovo);
  expect(spot, `semente ${seed}: o jardim abriu sem ovo nenhum`).toBeTruthy();
  return { x: spot!.x, y: spot!.y, scenery: world.getResource(SceneryResource) };
}

describe('o primeiro ovo está à vista', () => {
  it('nenhuma árvore desenhada por cima dele, em nenhuma semente', () => {
    const relatorio: string[] = [];
    for (const seed of SEMENTES) {
      const { x, y, scenery } = abertura(seed);
      const { col, row } = tileAt(x, y);

      // O QUE ESCONDE É O QUE ESTÁ NA FRENTE. Nesta projeção o desenho de cima
      // é o de maior `x + y`; uma árvore ATRÁS do ovo não atrapalha nada, e
      // cobrar clareira lá só empurraria a casca para os cantos vazios do mapa.
      const tapando = scenery.filter((p) => {
        const dc = p.col - col;
        const dr = p.row - row;
        return Math.abs(dc) <= 2 && Math.abs(dr) <= 2 && dc + dr >= 0;
      });
      relatorio.push(`${seed}: casa ${col},${row} · ${tapando.length} peças por cima`);
      expect(
        tapando.map((p) => `${p.kind} em ${p.col},${p.row}`),
        `semente ${seed}: tem cenário desenhado por cima do ovo`,
      ).toEqual([]);
    }
    console.log(relatorio.join('\n'));
  });

  it('e nem colado na borda, com meia casca fora da tela', () => {
    for (const seed of SEMENTES) {
      const { x, y } = abertura(seed);
      expect(
        Math.min(x, y, MUNDO.width - x, MUNDO.height - y),
        `semente ${seed}: o ovo nasceu na beirada do mundo`,
      ).toBeGreaterThanOrEqual(MARGEM);
    }
  });

  it('mas quem já nasce criatura continua podendo ficar na sombra', () => {
    // A clareira é só do ovo de abertura. Um jardim povoado tem bicho embaixo
    // de árvore à vontade — aliás é onde eles gostam de ficar. Se a regra
    // valesse para todo mundo, uma população inteira não caberia no mapa.
    const world = createWorld(MUNDO, 1337);
    spawnCreatures(world, 30);
    let vivos = 0;
    world.store(Creature).forEach(() => (vivos += 1));
    console.log(`${vivos} criaturas couberam num jardim arborizado`);
    expect(vivos, 'a clareira do ovo vazou para o resto da população').toBeGreaterThanOrEqual(30);
  });
});
