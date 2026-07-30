import { describe, it, expect } from 'vitest';
import { AnimationController } from './AnimationController';
import type { CreatureSignals } from './states';

/**
 * O CONTROLADOR: o estado da criatura virando animação.
 *
 * O que se cobra aqui é o comportamento que o briefing pede em palavras — que
 * o estado troque sozinho, que nunca troque no susto, que o trauma mude o
 * corpo, que os eventos de quadro cheguem sincronizados e que a criatura NUNCA
 * fique parada de verdade.
 */

const calmo: CreatureSignals = {
  intent: 'wander',
  pose: 0,
  mood: 0,
  moving: false,
  speed: 0,
  carrying: false,
  ball: false,
  scar: 0,
  fear: 0,
  happiness: 0.5,
  energy: 1,
  health: 1,
  touched: false,
  carried: false,
  lift: 0,
  isBaby: false,
};

/** Tudo existe e tem cinco quadros, como a folha de verdade. */
function controlador(options: Partial<Parameters<typeof make>[0]> = {}) {
  return make({ has: () => true, ...options });
}

function make(options: {
  has: (key: string) => boolean;
  onEvent?: (emit: string) => void;
  random?: () => number;
}) {
  return new AnimationController({
    frameCount: () => 5,
    fps: () => 10,
    ...options,
  });
}

function run(
  controller: AnimationController,
  signals: CreatureSignals,
  seconds: number,
  step = 1 / 60,
): void {
  for (let t = 0; t < seconds; t += step) controller.update(signals, step);
}

describe('o estado sai do que a criatura é', () => {
  it('parada é ocioso, andando é caminhar, ligeira é correr', () => {
    const c = controlador({ random: () => 0.99 });
    run(c, calmo, 0.2);
    expect(c.current).toBe('Idle');

    run(c, { ...calmo, moving: true, speed: 20 }, 0.2);
    expect(c.current).toBe('Walk');

    run(c, { ...calmo, moving: true, speed: 70 }, 0.2);
    expect(c.current).toBe('Run');
  });

  it('e o que é urgente passa na frente do que é rotina', () => {
    const c = controlador({ random: () => 0.99 });
    run(c, { ...calmo, moving: true, speed: 60 }, 0.3);
    expect(c.current).toBe('Run');

    // Um susto no meio da corrida: o medo manda mais que a locomoção.
    run(c, { ...calmo, moving: true, speed: 60, fear: 0.9 }, 0.2);
    expect(c.current).toBe('Fear');

    // E a morte manda mais que tudo.
    run(c, { ...calmo, health: 0, fear: 0.9 }, 0.2);
    expect(c.current).toBe('Dead');
  });

  it('a marca do trauma muda o corpo dela, não só o rosto', () => {
    const c = controlador({ random: () => 0.99 });
    const assustada = { ...calmo, fear: 0.6 };
    run(c, assustada, 0.3);
    expect(c.current).toBe('Fear');

    const marcada = { ...assustada, scar: 0.5 };
    run(c, marcada, 0.3);
    expect(c.current).toBe('Trauma');
    // Primeiro ela CONGELA — a travessia de entrada do trauma —, e só depois se
    // encolhe. Este teste cobrava `encolher` em três décimos de segundo, e
    // passava por um defeito: a animação de entrada era cortada no primeiro
    // quadro e ninguém nunca a viu. Meio segundo é o tempo dos cinco quadros a
    // dez por segundo.
    expect(c.clip, 'a travessia do trauma foi cortada').toBe('congelar');
    run(c, marcada, 0.5);
    expect(c.clip, 'depois de congelar, ela fica encolhida').toBe('encolher');
  });
});

describe('as transições', () => {
  it('saindo da corrida ela FREIA antes de voltar ao passo', () => {
    const c = controlador({ random: () => 0.99 });
    run(c, { ...calmo, moving: true, speed: 70 }, 0.4);
    expect(c.clip).toBe('correr');

    c.update({ ...calmo, moving: true, speed: 20 }, 1 / 60);
    expect(c.clip, 'trocou de corrida para passo sem frear').toBe('frear');

    // E depois da freada, o passo entra sozinho.
    run(c, { ...calmo, moving: true, speed: 20 }, 1);
    expect(c.clip).toBe('caminhar');
  });

  /**
   * A TRAVESSIA TEM DE DURAR O TEMPO DELA.
   *
   * O teste acima olhava a freada no PRIMEIRO tique depois da troca, e por isso
   * não pegava o defeito: a partir do segundo tique o estado já não era novidade,
   * a comparação "o que toca não é o laço que eu quero" era verdadeira, e o laço
   * atropelava a animação de entrada. Toda travessia da tabela durava dezesseis
   * milésimos de segundo — existia no código e nunca chegou à tela.
   */
  it('e ela dura os cinco quadros dela, não um só', () => {
    const c = controlador({ random: () => 0.99 });
    run(c, { ...calmo, moving: true, speed: 70 }, 0.4);

    const andando = { ...calmo, moving: true, speed: 20 };
    let quadros = 0;
    for (let t = 0; t < 0.45; t += 1 / 60) {
      c.update(andando, 1 / 60);
      if (c.clip === 'frear') quadros += 1;
    }
    // Cinco quadros a dez por segundo é meio segundo de freada; a sessenta
    // quadros por segundo, isso é bem mais de um tique.
    expect(quadros, 'a freada apareceu e sumiu no mesmo instante').toBeGreaterThan(20);
  });

  it('e a troca é MACIA: as duas animações convivem por um instante', () => {
    const c = controlador({ random: () => 0.99 });
    run(c, calmo, 0.3);
    c.update({ ...calmo, moving: true, speed: 20 }, 1 / 60);
    const view = c.view()!;
    expect(view.fadingKey, 'a troca foi seca').not.toBe(null);
    expect(view.blend).toBeLessThan(1);
  });
});

describe('os eventos de quadro', () => {
  it('o passo bate no chão nos quadros marcados', () => {
    const passos: string[] = [];
    const c = controlador({ random: () => 0.99, onEvent: (e) => passos.push(e) });
    run(c, { ...calmo, moving: true, speed: 20 }, 1);
    expect(passos.filter((e) => e === 'footstep').length).toBeGreaterThanOrEqual(2);
  });

  it('e a mordida sai no meio da mastigada', () => {
    const eventos: string[] = [];
    const c = controlador({ random: () => 0.99, onEvent: (e) => eventos.push(e) });
    run(c, { ...calmo, pose: 20 }, 1.5);
    expect(eventos).toContain('bite');
  });
});

describe('a criatura nunca fica parada de verdade', () => {
  it('parada, ela pisca, olha em volta, boceja', () => {
    const c = controlador({ random: () => 0.05 });
    const vistas = new Set<string>();
    for (let t = 0; t < 40; t += 1 / 60) {
      c.update(calmo, 1 / 60);
      const clip = c.clip;
      if (clip) vistas.add(clip);
    }
    vistas.delete('idle');
    expect(vistas.size, 'ela ficou o tempo todo no mesmo desenho').toBeGreaterThan(1);
  });

  it('mas não pisca no meio de uma fuga', () => {
    const c = controlador({ random: () => 0.05 });
    const vistas = new Set<string>();
    for (let t = 0; t < 30; t += 1 / 60) {
      c.update({ ...calmo, fear: 0.9, moving: true, speed: 60 }, 1 / 60);
      if (c.clip) vistas.add(c.clip);
    }
    expect([...vistas]).toEqual(['fugir']);
  });
});

describe('quando a folha não tem a animação', () => {
  it('cai no ocioso em vez de sumir da tela', () => {
    const c = make({ has: (key) => key === 'idle', random: () => 0.99 });
    run(c, { ...calmo, intent: 'mate' }, 0.3);
    expect(c.current).toBe('Courtship');
    expect(c.clip).toBe('idle');
  });
});

describe('um gesto pedido de fora', () => {
  it('passa por cima do estado e devolve o comando depois', () => {
    const c = controlador({ random: () => 0.99 });
    run(c, { ...calmo, moving: true, speed: 20 }, 0.3);
    expect(c.trigger('tapa')).toBe(true);
    expect(c.clip).toBe('tapa');

    run(c, { ...calmo, moving: true, speed: 20 }, 1.5);
    expect(c.clip).toBe('caminhar');
  });
});

describe('o colo, no corpo dela', () => {
  it('no ar ela é carregada; caindo, ela cai; no chão, ela se levanta', () => {
    const c = controlador({ random: () => 0.99 });
    run(c, calmo, 0.2);

    // Erguida: entra com o gesto de subir e fica no colo.
    c.update({ ...calmo, carried: true, lift: 4 }, 1 / 60);
    expect(c.current).toBe('Held');
    expect(c.clip).toBe('erguer');
    run(c, { ...calmo, carried: true, lift: 18 }, 1);
    expect(c.clip).toBe('colo');

    // Chacoalhada: a mão depressa muda o desenho.
    run(c, { ...calmo, carried: true, lift: 18, speed: 300 }, 0.4);
    expect(c.clip, 'sacudiram e ela nem se mexeu').toBe('sacudir');

    // Solta: cai.
    run(c, { ...calmo, lift: 14 }, 0.3);
    expect(c.current).toBe('Falling');
    expect(c.clip).toBe('cairMao');

    // E ao encostar no chão, primeiro se levanta.
    c.update({ ...calmo, lift: 0, pose: 9 }, 1 / 60);
    expect(c.current).toBe('Pose');
    expect(c.clip, 'passou do ar para o gesto seguinte sem se levantar').toBe('levantarQueda');
  });

  it('e no colo ela SE DEBATE — não chora encolhida como quem está sozinha', () => {
    const c = controlador({ random: () => 0.99 });
    // Um filhote apavorado, no chão, chora.
    run(c, { ...calmo, isBaby: true, fear: 0.9 }, 0.3);
    expect(c.current).toBe('Fear');
    expect(c.clip).toBe('filhoteChora');

    // O mesmo filhote apavorado, na sua mão, se debate: o colo é o fato que
    // manda, e chorar encolhido no mato é uma cena que não é essa.
    run(c, { ...calmo, isBaby: true, fear: 0.9, carried: true, lift: 18 }, 1);
    expect(c.current).toBe('Held');
    expect(c.clip).toBe('balancar');
  });
});
