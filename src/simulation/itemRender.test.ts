import { describe, it, expect } from 'vitest';
import { RenderBuffer, SystemScheduler, writeRenderBuffer } from '@engine';
import { Ball, ballSystem, createWorld, spawnBall, spawnFruit, spawnPlant } from '@world';
import { writeItemBuffer } from './itemRender';

const CONFIG = { width: 1000, height: 1000 };

/**
 * CADA COISA É DESENHADA UMA VEZ SÓ.
 *
 * Os objetos já foram desenhados duas vezes: uma pelo buffer de `Sprite`, que
 * só sabe pôr uma figura num ponto do chão, e outra pelo buffer de objetos, que
 * sabe do frescor, do esconderijo, da pilha e da altura. Sobrepostas, as duas
 * cópias eram invisíveis — até a bola quicar e uma delas subir sem a outra, e
 * o jardim parecer ter duas bolas onde só havia uma.
 */
describe('cada objeto é desenhado uma vez', () => {
  it('objeto nenhum aparece no buffer de recursos', () => {
    const world = createWorld(CONFIG, 5);
    const plants = new RenderBuffer(64);
    const antes = (writeRenderBuffer(world, plants), plants.count);

    spawnFruit(world, 300, 300, { variant: 0 });
    spawnBall(world, 400, 400);
    writeRenderBuffer(world, plants);

    expect(plants.count).toBe(antes);
  });

  it('mas as plantas continuam lá', () => {
    const world = createWorld(CONFIG, 5);
    const plants = new RenderBuffer(64);
    writeRenderBuffer(world, plants);
    const antes = plants.count;

    spawnPlant(world, 300, 300);
    writeRenderBuffer(world, plants);

    expect(plants.count).toBe(antes + 1);
  });

  it('e a bola no ar é desenhada UMA vez, acima do seu ponto no chão', () => {
    const world = createWorld(CONFIG, 5);
    const id = spawnBall(world, 400, 400);
    new SystemScheduler().add(ballSystem).update(world, 0.05);

    const items = new RenderBuffer(64);
    writeItemBuffer(world, items);
    const bola = world.store(Ball).get(id)!;

    // Altura tirada dos dois eixos: na projeção isométrica é isso que faz o
    // desenho subir reto, sem escorregar para o lado.
    const noAr: number[] = [];
    for (let i = 0; i < items.count; i++) {
      if (Math.abs(items.x[i]! - (400 - bola.z)) < 0.001 && items.x[i] === items.y[i]) {
        noAr.push(i);
      }
    }
    expect(bola.z).toBeGreaterThan(0);
    expect(noAr).toHaveLength(1);
  });
});
