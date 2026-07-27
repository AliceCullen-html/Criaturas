import { describe, it, expect } from 'vitest';
import { POSE } from '@core';
import { BREATHE, FRAME, RUN_CYCLE, WALK_CYCLE, frameFor } from './textures/tintimSheet';

/**
 * QUAL QUADRO APARECE.
 *
 * A folha do Tintim tem vinte desenhos e a simulação não sabe que eles
 * existem: ela produz humor, pose, velocidade e "está carregando algo". A
 * tradução de um para o outro é esta função, e é o único lugar do jogo onde a
 * arte encontra o comportamento.
 *
 * O que se cobra aqui é a ORDEM DE IMPORTÂNCIA. Uma criatura com dor andando
 * tem de mostrar a dor, não o passo; uma que dorme não pisca. Errar a ordem
 * não quebra nada — só faz a criatura mentir sobre o que está sentindo, que é
 * o único defeito que este projeto não pode ter.
 */

const base = { mood: 0, pose: POSE.none, moving: false, speed: 0, carrying: false, step: 0, breath: 0 };

describe('a folha conta o que a criatura está sentindo', () => {
  it('parada e sem nada acontecendo, ela RESPIRA', () => {
    // Não é um quadro só: o corpo sobe e desce. Um jardim de bichos parados em
    // que ninguém respira é um jardim de bonecos.
    const vistos = new Set<number>();
    for (let t = 0; t < 4; t += 0.2) vistos.add(frameFor({ ...base, breath: t }));
    expect([...vistos].sort(), 'ficou congelada no repouso').toEqual([...BREATHE].sort());
  });

  it('andando, percorre o ciclo de passos; correndo, o de corrida', () => {
    const walked = WALK_CYCLE.map((_, i) => frameFor({ ...base, moving: true, speed: 20, step: i }));
    expect(walked).toEqual([...WALK_CYCLE]);
    // O ciclo dá a volta: o passo 4 é o mesmo que o passo 0.
    expect(frameFor({ ...base, moving: true, speed: 20, step: 4 })).toBe(WALK_CYCLE[0]);

    const ran = frameFor({ ...base, moving: true, speed: 60, step: 1 });
    expect(RUN_CYCLE).toContain(ran);
    expect(WALK_CYCLE).not.toContain(ran);
  });

  it('a dor vem antes de tudo — inclusive de estar andando', () => {
    expect(frameFor({ ...base, pose: POSE.hurt, moving: true, speed: 60 })).toBe(FRAME.sad);
    expect(frameFor({ ...base, pose: POSE.hurt, carrying: true })).toBe(FRAME.sad);
  });

  it('quem está levando comida mostra que está levando', () => {
    expect(frameFor({ ...base, carrying: true, moving: true, speed: 20 })).toBe(FRAME.carry);
  });

  it('deitada ou sentada, e o humor sonolento, dormem', () => {
    expect(frameFor({ ...base, pose: POSE.lie })).toBe(FRAME.sleeping);
    expect(frameFor({ ...base, mood: 3 })).toBe(FRAME.sleeping);
    // Sentar ganhou desenho próprio na folha nova: não é mais "dormir".
    expect(frameFor({ ...base, pose: POSE.sit })).toBe(FRAME.sit);
  });

  it('cada humor tem o seu rosto, e nenhum cai no repouso por engano', () => {
    const esperado: Array<[number, number]> = [
      [1, FRAME.happy],
      [4, FRAME.surprised],
      [5, FRAME.angry],
      [6, FRAME.sad],
      [7, FRAME.loved],
      [8, FRAME.afraid],
      [9, FRAME.curious],
    ];
    for (const [mood, frame] of esperado) {
      expect(frameFor({ ...base, mood }), `humor ${mood}`).toBe(frame);
    }
  });

  it('parada, o gesto em curso vira uma ANIMAÇÃO, não um quadro parado', () => {
    // O que separa "se coçar" de "cheirar uma flor" é o movimento. Cada gesto
    // precisa de mais de um desenho, senão os dezenove viram o mesmo.
    const anima = (pose: number): number[] => {
      const vistos = new Set<number>();
      for (let t = 0; t < 3; t += 0.05) vistos.add(frameFor({ ...base, pose, breath: t }));
      return [...vistos];
    };
    expect(anima(POSE.scratch).length, 'se coçar ficou parado').toBeGreaterThan(1);
    expect(anima(POSE.shake).length, 'se sacudir ficou parado').toBeGreaterThan(1);
    expect(anima(POSE.play).length, 'brincar ficou parado').toBeGreaterThan(1);
    expect(anima(POSE.roll).length, 'rolar ficou parado').toBeGreaterThan(1);
    // Gestos diferentes têm desenhos diferentes.
    expect(anima(POSE.scratch)).not.toEqual(anima(POSE.shake));
    expect(anima(POSE.dig)).not.toEqual(anima(POSE.play));
    // Mas andando o passo ganha do gesto: quem anda, anda.
    expect(WALK_CYCLE).toContain(frameFor({ ...base, pose: POSE.ponder, moving: true, speed: 20 }));
  });

  it('nenhum quadro escolhido fica fora da folha', () => {
    // A folha tem 42 desenhos; nenhuma combinação de humor e gesto pode pedir
    // um que não exista.
    for (let mood = 0; mood < 13; mood++) {
      for (let pose = 0; pose < 19; pose++) {
        for (const moving of [false, true]) {
          const frame = frameFor({ ...base, mood, pose, moving, speed: moving ? 40 : 0, breath: 1.7 });
          expect(frame, `humor ${mood} pose ${pose}`).toBeGreaterThanOrEqual(0);
          expect(frame, `humor ${mood} pose ${pose}`).toBeLessThan(42);
        }
      }
    }
  });
});
