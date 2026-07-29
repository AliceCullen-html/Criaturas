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

function montar(options: { canHurt?: boolean; canGrab?: boolean; toca?: () => boolean } = {}) {
  const chamadas = { pet: 0, rough: 0, colo: 0, carrega: 0, solta: 0, atirada: 0 };
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
    onLiftCreature: () => {
      chamadas.colo += 1;
    },
    onCarryCreature: () => {
      chamadas.carrega += 1;
    },
    onDropCreature: (_id: number, _x: number, _y: number, vx: number, vy: number) => {
      chamadas.solta += 1;
      if (Math.hypot(vx, vy) > 320) chamadas.atirada += 1;
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
    canGrab: () => options.canGrab ?? false,
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

describe('pegar a criatura no colo', () => {
  it('a mão apoiada FECHA, e só então o arrasto a levanta', () => {
    const { gestos, chamadas } = montar({ canGrab: true });
    gestos.pointerDown(0, 0, 1000, 0);

    // Meio segundo de mão apoiada: ela ainda está no chão, mas a mão já fechou.
    for (let i = 0; i < 12; i++) gestos.tick(0.05);
    expect(chamadas.colo, 'levantou sozinha, sem ninguém puxar').toBe(0);
    expect(gestos.liftProgress).toBe(1);

    // Agora sim: puxou.
    gestos.pointerMove(30, 10, 1600);
    expect(chamadas.colo).toBe(1);
    expect(gestos.carriedCreature).toBe(7);

    // E ela acompanha a mão.
    gestos.pointerMove(60, 20, 1650);
    expect(chamadas.carrega).toBeGreaterThanOrEqual(2);
  });

  it('carinho não levanta ninguém: quem passa a mão nela está fazendo carinho', () => {
    const { gestos, chamadas } = montar({ canGrab: true });
    gestos.pointerDown(0, 0, 1000, 0);
    // Um afago é MOVIMENTO desde o começo — o relógio do colo nem chega ao fim.
    for (let i = 1; i <= 12; i++) {
      gestos.pointerMove(i % 2 === 0 ? 10 : -10, 0, 1000 + i * 50);
      gestos.tick(0.05);
    }
    expect(chamadas.colo).toBe(0);
    expect(chamadas.pet).toBeGreaterThan(0);
  });

  it('pousar devagar é pousar; soltar no meio de um arremesso é atirar', () => {
    const devagar = montar({ canGrab: true });
    devagar.gestos.pointerDown(0, 0, 1000, 0);
    for (let i = 0; i < 12; i++) devagar.gestos.tick(0.05);
    devagar.gestos.pointerMove(30, 0, 1600);
    devagar.gestos.pointerMove(34, 0, 1900);
    devagar.gestos.pointerUp(34, 0, 1950, 0);
    expect(devagar.chamadas.solta).toBe(1);
    expect(devagar.chamadas.atirada, 'pousada com cuidado virou arremesso').toBe(0);
    expect(devagar.gestos.carriedCreature).toBe(null);

    const atirada = montar({ canGrab: true });
    atirada.gestos.pointerDown(0, 0, 1000, 0);
    for (let i = 0; i < 12; i++) atirada.gestos.tick(0.05);
    atirada.gestos.pointerMove(30, 0, 1600);
    atirada.gestos.pointerMove(300, 0, 1620);
    atirada.gestos.pointerMove(600, 0, 1640);
    atirada.gestos.pointerUp(600, 0, 1645, 0);
    expect(atirada.chamadas.atirada, 'um arremesso passou por pouso').toBe(1);
  });

  it('sem mão livre (esponja, livro), ninguém sai do chão', () => {
    const { gestos, chamadas } = montar({ canGrab: false });
    gestos.pointerDown(0, 0, 1000, 0);
    for (let i = 0; i < 20; i++) gestos.tick(0.05);
    gestos.pointerMove(40, 10, 2000);
    expect(chamadas.colo).toBe(0);
  });
});

describe('com a criatura no colo, a mão está ocupada', () => {
  it('não sai arrancando a árvore que estava embaixo dela', () => {
    const arrancou = { arvore: 0 };
    const chamadas = { colo: 0 };
    const handlers = {
      onSelect: () => {},
      onGrab: () => {},
      onDragHeld: () => {},
      onRelease: () => {},
      onPet: () => {},
      onPetRemembered: () => {},
      onRough: () => {},
      onLiftCreature: () => {
        chamadas.colo += 1;
      },
      onCarryCreature: () => {},
      onDropCreature: () => {},
      onCall: () => {},
      onObserve: () => {},
      onOffer: () => {},
      onHandMove: () => {},
      onPokeScenery: () => {},
      onGrabScenery: () => {
        arrancou.arvore += 1;
      },
      onDragScenery: () => {},
      onDropScenery: () => {},
      onPokeGround: () => {},
      onPokeWater: () => {},
      onMarquee: () => {},
      onMarqueeEnd: () => {},
      onOrder: () => {},
    } satisfies GestureHandlers;
    const probe: WorldProbe = {
      creatureAt: () => BICHO,
      canGrab: () => true,
      canHurt: () => false,
      stillTouching: () => true,
      hasSelection: () => false,
      itemAt: () => null,
      // Debaixo da criatura há uma árvore — que é o caso normal do jardim.
      sceneryAt: () => ({ kind: 'tree', index: 3 }),
      isWater: () => false,
    };
    const gestos = new GestureRecognizer(handlers, probe);

    gestos.pointerDown(0, 0, 1000, 0);
    for (let i = 0; i < 12; i++) gestos.tick(0.05);
    gestos.pointerMove(30, 10, 1600);
    expect(chamadas.colo).toBe(1);

    // Mais um segundo com a criatura na mão: a árvore continua plantada.
    for (let i = 0; i < 20; i++) gestos.tick(0.05);
    expect(arrancou.arvore, 'levou o bicho e a árvore no mesmo gesto').toBe(0);
  });
});

describe('arrastar não é bater', () => {
  it('a mão que pousou nela antes de puxar nunca machuca', () => {
    const { gestos, chamadas } = montar({ canHurt: true, canGrab: true });
    gestos.pointerDown(0, 0, 1000, 0);
    // Meio segundo de mão apoiada — a mão fecha.
    for (let i = 0; i < 12; i++) gestos.tick(0.05);
    // E agora um puxão bem rápido, do tipo que antes era registrado como tapa.
    gestos.pointerMove(200, 0, 1620);
    gestos.pointerMove(400, 0, 1640);
    expect(chamadas.rough, 'levar a criatura depressa virou pancada').toBe(0);
    expect(chamadas.colo).toBe(1);
  });

  it('mas o reflexo — apertar e sacudir na hora — continua sendo pancada', () => {
    const { gestos, chamadas } = montar({ canHurt: true, canGrab: true });
    gestos.pointerDown(0, 0, 1000, 0);
    gestos.pointerMove(200, 0, 1020);
    gestos.pointerMove(400, 0, 1040);
    expect(chamadas.rough).toBe(1);
  });

  it('e um arrasto ligeiro depois de pensar um instante também não machuca', () => {
    const { gestos, chamadas } = montar({ canHurt: true, canGrab: false });
    gestos.pointerDown(0, 0, 1000, 0);
    // Sem mão livre não há colo — e passada a janela do reflexo, não há tapa.
    gestos.pointerMove(10, 0, 1400);
    gestos.pointerMove(300, 0, 1420);
    gestos.pointerMove(600, 0, 1440);
    expect(chamadas.rough).toBe(0);
  });
});
