import { describe, it, expect } from 'vitest';
import { GestureRecognizer, type GestureHandlers, type WorldProbe } from './gestures';

/**
 * OS GESTOS DE CUIDAR.
 *
 * Três coisas quebravam o banho, e todas eram da camada de gesto — a esponja
 * funcionava, o que não funcionava era a mão chegar nela. Ficam presas aqui:
 * esfregar não é bater, o contato não morre no primeiro pixel de fora, e o
 * alvo não é esquecido só porque a criatura andou.
 */

const BICHO = 7;

function montar(options: { canHurt?: boolean; toca?: () => boolean } = {}) {
  const chamadas = { pet: 0, rough: 0 };
  const handlers = {
    onSelect: () => {},
    onGrab: () => {},
    onDragHeld: () => {},
    onRelease: () => {},
    onPet: () => {
      chamadas.pet += 1;
    },
    onPetRemembered: () => {},
    onRough: () => {
      chamadas.rough += 1;
    },
    onCall: () => {},
    onObserve: () => {},
    onOffer: () => {},
    onHandMove: () => {},
    onPokeScenery: () => {},
    onGrabScenery: () => {},
    onDragScenery: () => {},
    onDropScenery: () => {},
    onPokeGround: () => {},
    onPokeWater: () => {},
    onMarquee: () => {},
    onMarqueeEnd: () => {},
    onOrder: () => {},
  } satisfies GestureHandlers;

  // A criatura ocupa um quadradinho na origem; "encostada" é um alcance maior.
  let emCima = true;
  const probe: WorldProbe = {
    creatureAt: () => (emCima ? BICHO : null),
    canGrab: () => false,
    canHurt: () => options.canHurt ?? false,
    stillTouching: options.toca ?? (() => true),
    hasSelection: () => false,
    itemAt: () => null,
    sceneryAt: () => null,
    isWater: () => false,
  };

  return {
    gestos: new GestureRecognizer(handlers, probe),
    chamadas,
    sai: () => {
      emCima = false;
    },
    volta: () => {
      emCima = true;
    },
  };
}

describe('esfregar não é bater', () => {
  it('com a esponja na mão, um gesto rápido e longo não machuca', () => {
    const { gestos, chamadas } = montar({ canHurt: false });
    gestos.pointerDown(0, 0, 1000, 0);
    // Rápido e longe: exatamente o que a mão nua registraria como pancada.
    gestos.pointerMove(200, 0, 1020);
    gestos.pointerMove(400, 0, 1040);
    expect(chamadas.rough).toBe(0);
  });

  it('com a mão nua, o mesmo gesto machuca', () => {
    const { gestos, chamadas } = montar({ canHurt: true });
    gestos.pointerDown(0, 0, 1000, 0);
    gestos.pointerMove(200, 0, 1020);
    gestos.pointerMove(400, 0, 1040);
    expect(chamadas.rough).toBe(1);
  });
});

describe('o contato do banho', () => {
  it('sobrevive à esponja sair de cima dela por um instante', () => {
    const fora = { agora: false };
    const { gestos, chamadas } = montar({ toca: () => !fora.agora });
    gestos.pointerDown(0, 0, 1000, 0);
    gestos.tick(0.05);
    const primeiras = chamadas.pet;
    expect(primeiras).toBeGreaterThan(0);

    fora.agora = true;
    gestos.tick(0.1);
    gestos.tick(0.1);
    // Dentro da folga, a esfregada continua contando.
    expect(chamadas.pet).toBe(primeiras + 2);
  });

  it('para quando a mão fica longe de verdade', () => {
    const { gestos, chamadas } = montar({ toca: () => false });
    gestos.pointerDown(0, 0, 1000, 0);
    for (let i = 0; i < 20; i++) gestos.tick(0.05);
    // Meio segundo de mão fora: a esfregada acabou muito antes do fim.
    expect(chamadas.pet).toBeLessThan(10);
  });

  it('e volta sozinho quando a mão alcança a criatura de novo', () => {
    const fora = { agora: false };
    const { gestos, chamadas } = montar({ toca: () => !fora.agora });
    gestos.pointerDown(0, 0, 1000, 0);
    fora.agora = true;
    for (let i = 0; i < 20; i++) gestos.tick(0.05);
    const parado = chamadas.pet;

    // A criatura andou e a mão a alcançou: sem clique novo, o banho continua.
    fora.agora = false;
    gestos.tick(0.05);
    gestos.tick(0.05);
    expect(chamadas.pet).toBe(parado + 2);
  });
});
