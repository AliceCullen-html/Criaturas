import { describe, it, expect } from 'vitest';
import { SystemScheduler, Transform } from '@engine';
import { createWorld, Item, itemSystem, spawnFruit } from '@world';

/**
 * O TREMOR ETERNO.
 *
 * O jogador viu: "alguns itens ficam tremendo no chão e travados". Travados era
 * a palavra certa — eles não estavam presos, estavam VIBRANDO entre o penúltimo
 * e o último passo, para sempre.
 *
 * A causa é a interpolação. O render desenha entre `prev` e a posição atual,
 * pesando pelo `alpha` do quadro: é o que faz o movimento ser liso a sessenta
 * quadros com a simulação rodando a vinte. Mas `prev` só era atualizado
 * ENQUANTO o objeto se movia. Parando, ficava congelado no ponto anterior — e o
 * desenho passava o resto da partida oscilando entre dois lugares.
 *
 * Por isso era "alguns": o que nasce parado já nasce com `prev` igual à
 * posição. Só quem foi arremessado ou empurrado ficava assim.
 */

const DT = 1 / 20;

describe('o que para, para de verdade', () => {
  it('uma fruta arremessada não fica tremendo no chão depois de parar', () => {
    const world = createWorld({ width: 400, height: 400 }, 5);
    const fruta = spawnFruit(world, 200, 200, { toxic: false, variant: 0 });
    const item = world.store(Item).get(fruta)!;
    item.vx = 120;
    item.vy = 40;

    const run = new SystemScheduler().add(itemSystem);
    for (let tick = 0; tick < 20 * 20; tick++) {
      run.update(world, DT);
      world.tick += 1;
    }

    const spot = world.store(Transform).get(fruta)!;
    expect(item.vx, 'a fruta nunca parou').toBe(0);
    // A DISTÂNCIA ENTRE O PASSADO E O PRESENTE é o tamanho do tremor: é
    // exatamente entre esses dois pontos que o desenho fica oscilando.
    const tremor = Math.hypot(spot.x - spot.prevX, spot.y - spot.prevY);
    console.log(`parada em (${spot.x.toFixed(0)},${spot.y.toFixed(0)}) · tremor ${tremor.toFixed(3)}px`);
    expect(tremor, 'parou de andar mas continuou tremendo entre dois pontos').toBeLessThan(0.01);
  });

  it('e uma fruta que nunca se mexeu já nasce quieta', () => {
    const world = createWorld({ width: 400, height: 400 }, 7);
    const fruta = spawnFruit(world, 120, 120, { toxic: false, variant: 0 });
    const run = new SystemScheduler().add(itemSystem);
    for (let tick = 0; tick < 20 * 5; tick++) run.update(world, DT);
    const spot = world.store(Transform).get(fruta)!;
    expect(Math.hypot(spot.x - spot.prevX, spot.y - spot.prevY)).toBe(0);
  });
});
