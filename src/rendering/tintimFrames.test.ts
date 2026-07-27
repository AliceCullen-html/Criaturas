import { describe, it, expect } from 'vitest';
import { POSE } from '@core';
import { FRAME, RUN_CYCLE, WALK_CYCLE, frameFor } from './textures/tintimSheet';

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

const base = { mood: 0, pose: POSE.none, moving: false, speed: 0, carrying: false, step: 0 };

describe('a folha conta o que a criatura está sentindo', () => {
  it('parada e sem nada acontecendo, é o quadro de repouso', () => {
    expect(frameFor(base)).toBe(FRAME.idle);
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
    expect(frameFor({ ...base, pose: POSE.sit })).toBe(FRAME.sleeping);
    expect(frameFor({ ...base, mood: 3 })).toBe(FRAME.sleeping);
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

  it('parada, o gesto em curso é que manda no quadro', () => {
    expect(frameFor({ ...base, pose: POSE.lookUp })).toBe(FRAME.look);
    expect(frameFor({ ...base, pose: POSE.listen })).toBe(FRAME.look);
    expect(frameFor({ ...base, pose: POSE.ponder })).toBe(FRAME.curious);
    expect(frameFor({ ...base, pose: POSE.play })).toBe(FRAME.happy);
    expect(frameFor({ ...base, pose: POSE.dig })).toBe(FRAME.push);
    // Mas andando o passo ganha do gesto: quem anda, anda.
    expect(WALK_CYCLE).toContain(frameFor({ ...base, pose: POSE.ponder, moving: true, speed: 20 }));
  });

  it('nenhum quadro escolhido fica fora da folha', () => {
    for (let mood = 0; mood < 13; mood++) {
      for (let pose = 0; pose < 19; pose++) {
        for (const moving of [false, true]) {
          const frame = frameFor({ ...base, mood, pose, moving, speed: moving ? 40 : 0 });
          expect(frame, `humor ${mood} pose ${pose}`).toBeGreaterThanOrEqual(0);
          expect(frame, `humor ${mood} pose ${pose}`).toBeLessThan(20);
        }
      }
    }
  });
});
