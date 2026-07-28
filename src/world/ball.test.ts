import { describe, it, expect } from 'vitest';
import { SystemScheduler } from '@engine';
import { Ball, ballSystem, ballVariant, createWorld, Item, spawnBall, VARIANT } from './index';

const CONFIG = { width: 1000, height: 1000 };

/**
 * A BOLA TEM DE QUICAR — de verdade, e por tempo suficiente para se ver.
 *
 * Este teste existe porque a primeira versão estava "correta": gravidade de
 * livro, restituição plausível, e uma bola que cumpria todo o quique em um
 * terço de segundo e parecia colada no chão. O que importa não é a física ser
 * exata, é o pulo ser VISÍVEL — e isso é uma medida, não uma opinião.
 */
describe('a bola quica', () => {
  /** Roda a física da bola por `seconds` e devolve a altura a cada tique. */
  function drop(seconds: number): { alturas: number[]; picos: number[] } {
    const world = createWorld(CONFIG, 7);
    const ball = spawnBall(world, 500, 500);
    const scheduler = new SystemScheduler().add(ballSystem);
    const alturas: number[] = [];
    for (let tick = 0; tick < seconds * 20; tick++) {
      scheduler.update(world, 0.05);
      alturas.push(world.store(Ball).get(ball)!.z);
    }
    const picos = alturas.filter(
      (z, i) => i > 0 && i < alturas.length - 1 && z > alturas[i - 1]! && z >= alturas[i + 1]!,
    );
    return { alturas, picos };
  }

  it('largada no jardim, dá pelo menos dois quiques visíveis', () => {
    const { picos } = drop(4);
    expect(picos.length).toBeGreaterThanOrEqual(2);
    // Um quique de dois pixels não é um quique: é um tremor. O primeiro tem de
    // subir mais que a altura da própria bola.
    expect(picos[0]!).toBeGreaterThan(16);
  });

  it('leva mais de um segundo até assentar — dá tempo de ver', () => {
    const { alturas } = drop(4);
    const ultimo = alturas.reduce((acc, z, i) => (z > 0.5 ? i : acc), 0);
    expect(ultimo / 20).toBeGreaterThan(1);
  });

  it('e assenta: não fica quicando para sempre', () => {
    const { alturas } = drop(8);
    expect(alturas[alturas.length - 1]).toBe(0);
  });

  it('na mão do jogador ela fica parada', () => {
    const world = createWorld(CONFIG, 7);
    const id = spawnBall(world, 500, 500);
    world.store(Item).get(id)!.held = true;
    const scheduler = new SystemScheduler().add(ballSystem);
    for (let tick = 0; tick < 20; tick++) scheduler.update(world, 0.05);
    expect(world.store(Ball).get(id)!.z).toBe(0);
  });

  it('o desenho segue o estado: no ar, caindo, impacto, rolando', () => {
    expect(ballVariant({ z: 30, prevZ: 30, vz: 120, roll: 0, hit: 0 }, 0)).toBe(VARIANT.ballRise);
    expect(ballVariant({ z: 30, prevZ: 30, vz: -120, roll: 0, hit: 0 }, 0)).toBe(VARIANT.ballFall);
    expect(ballVariant({ z: 30, prevZ: 30, vz: 0, roll: 0, hit: 0 }, 0)).toBe(VARIANT.ballAir);
    expect(ballVariant({ z: 0, prevZ: 0, vz: 0, roll: 0, hit: 0.05 }, 0)).toBe(VARIANT.ballHit);
    expect(ballVariant({ z: 0, prevZ: 0, vz: 0, roll: 0, hit: 0 }, 40)).toBe(VARIANT.ballRoll1);
    expect(ballVariant({ z: 0, prevZ: 0, vz: 0, roll: 1, hit: 0 }, 40)).toBe(VARIANT.ballRoll2);
    expect(ballVariant({ z: 0, prevZ: 0, vz: 0, roll: 0, hit: 0 }, 0)).toBe(VARIANT.ball);
  });

  it('a altura anterior acompanha, para o desenho interpolar o pulo', () => {
    const world = createWorld(CONFIG, 7);
    const id = spawnBall(world, 500, 500);
    const scheduler = new SystemScheduler().add(ballSystem);
    scheduler.update(world, 0.05);
    scheduler.update(world, 0.05);
    const ball = world.store(Ball).get(id)!;
    expect(ball.prevZ).toBeGreaterThan(ball.z);
  });
});
