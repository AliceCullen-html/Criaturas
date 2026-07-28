import { describe, it, expect } from 'vitest';
import { Animator } from './Animator';

/**
 * O MOTOR DE ANIMAÇÃO, quadro a quadro.
 *
 * Ele é puro de propósito — não conhece Pixi, não conhece o jogo —, e é por
 * isso que dá para cobrar dele o comportamento inteiro aqui, sem abrir uma
 * janela: prioridade, fila, laço, marcha a ré, pausa, velocidade e os eventos
 * de quadro, que são o que sincroniza som, partícula e lógica.
 */

/** Cinco quadros para tudo, como a folha de sprites do jogo. */
const motor = (): Animator => new Animator({ frameCount: () => 5, fps: () => 10 });

/** Avança o relógio em passos pequenos, como o jogo faz. */
function run(animator: Animator, seconds: number, step = 1 / 60): void {
  for (let t = 0; t < seconds; t += step) animator.update(step);
}

describe('o animador toca', () => {
  it('anda pelos quadros no tempo da animação', () => {
    const a = motor();
    a.play('caminhar', { loop: true });
    expect(a.view()?.frame).toBe(0);
    run(a, 0.25);
    expect(a.view()?.frame).toBe(2);
    run(a, 0.2);
    expect(a.view()?.frame).toBe(4);
  });

  it('em laço, dá a volta; sem laço, para no último quadro', () => {
    const emLaco = motor();
    emLaco.play('caminhar', { loop: true });
    run(emLaco, 0.55);
    expect(emLaco.view()?.frame).toBe(0);
    expect(emLaco.finished).toBe(false);

    const umaVez = motor();
    umaVez.play('sentar');
    run(umaVez, 2);
    expect(umaVez.view()?.frame).toBe(4);
    expect(umaVez.finished).toBe(true);
  });

  it('de trás para frente é a mesma animação ao contrário', () => {
    const a = motor();
    a.play('levantar', { reverse: true });
    expect(a.view()?.frame).toBe(4);
    run(a, 0.25);
    expect(a.view()?.frame).toBe(2);
  });

  it('o multiplicador de velocidade acelera e a pausa congela', () => {
    const rapido = motor();
    rapido.play('correr', { loop: true, speed: 2 });
    run(rapido, 0.1);
    expect(rapido.view()?.frame).toBe(2);

    const parado = motor();
    parado.play('correr', { loop: true });
    parado.pause();
    run(parado, 1);
    expect(parado.view()?.frame).toBe(0);
    parado.resume();
    run(parado, 0.1);
    expect(parado.view()?.frame).toBe(1);
  });
});

describe('quem manda mais', () => {
  it('animação de prioridade menor não corta a maior', () => {
    const a = motor();
    a.play('morrendo', { priority: 100 });
    expect(a.play('piscar', { priority: 1 })).toBe(false);
    expect(a.playing).toBe('morrendo');
  });

  it('mas a de prioridade igual ou maior toma o lugar', () => {
    const a = motor();
    a.play('caminhar', { loop: true, priority: 10 });
    expect(a.play('assustar', { priority: 50 })).toBe(true);
    expect(a.playing).toBe('assustar');
  });

  it('e a interrupção passa por cima de tudo, fila inclusive', () => {
    const a = motor();
    a.play('mastigar', { priority: 30 });
    a.queue('engolir');
    a.interrupt('fugir', { priority: 90 });
    expect(a.playing).toBe('fugir');
    expect(a.queued).toEqual([]);
  });
});

describe('a fila', () => {
  it('toca uma depois da outra, na ordem', () => {
    const a = motor();
    const ordem: string[] = [];
    a.play('pegarComida', { onEnd: () => ordem.push('pegou') });
    a.queue('mastigar', { onEnd: () => ordem.push('mastigou') });
    a.queue('engolir', { onEnd: () => ordem.push('engoliu') });

    run(a, 2);
    expect(ordem).toEqual(['pegou', 'mastigou', 'engoliu']);
    expect(a.playing).toBe('engolir');
  });

  it('pedir com a fila vazia toca na hora', () => {
    const a = motor();
    a.queue('bocejar');
    expect(a.playing).toBe('bocejar');
  });
});

describe('os eventos de quadro', () => {
  it('saem uma vez por quadro, na ordem', () => {
    const a = motor();
    const vistos: number[] = [];
    a.play('comer', { onFrame: (frame) => vistos.push(frame) });
    run(a, 1);
    expect(vistos).toEqual([0, 1, 2, 3, 4]);
  });

  it('não repetem quando o quadro do jogo é longo', () => {
    const a = motor();
    const vistos: number[] = [];
    a.play('comer', { loop: true, onFrame: (frame) => vistos.push(frame) });
    // Um tranco de 250 ms: o relógio pula quadros, mas nenhum sai duas vezes.
    a.update(0.25);
    a.update(0.25);
    expect(new Set(vistos).size).toBe(vistos.length);
  });

  it('e é por eles que o som e a partícula ficam no lugar certo', () => {
    const a = motor();
    let mordidas = 0;
    a.play('mastigar', {
      loop: true,
      onFrame: (frame) => {
        if (frame === 2) mordidas += 1;
      },
    });
    run(a, 1.5);
    expect(mordidas).toBe(3);
  });
});

describe('a travessia entre duas animações', () => {
  it('mistura a que sai com a que entra e termina na nova', () => {
    const a = motor();
    a.play('caminhar', { loop: true });
    run(a, 0.2);
    a.play('correr', { loop: true, crossfade: 0.2 });

    const meio = a.view()!;
    expect(meio.fadingKey).toBe('caminhar');
    expect(meio.blend).toBeLessThan(0.5);

    run(a, 0.3);
    const depois = a.view()!;
    expect(depois.fadingKey).toBe(null);
    expect(depois.blend).toBe(1);
    expect(depois.key).toBe('correr');
  });

  it('sem travessia pedida, a troca é seca', () => {
    const a = motor();
    a.play('caminhar', { loop: true });
    a.play('idle', { loop: true });
    expect(a.view()?.fadingKey).toBe(null);
  });
});

describe('o mesmo laço pedido de novo', () => {
  it('não recomeça — senão o passo congelava no primeiro quadro', () => {
    const a = motor();
    a.play('caminhar', { loop: true });
    run(a, 0.25);
    a.play('caminhar', { loop: true });
    expect(a.view()?.frame).toBe(2);
  });
});
