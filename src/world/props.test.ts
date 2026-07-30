import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { PROP, PropsResource, isTallProp } from './props';

/**
 * O MATO NÃO PODE ESCONDER O BICHO.
 *
 * Grama alta, junco e tronco são os únicos detalhes do chão que ficam DE PÉ:
 * eles entram na ordenação por profundidade junto com as criaturas e podem
 * passar na frente delas. O jardim estava com um terço do chão coberto de
 * coisa em pé — a margem do lago era uma cerca de juncos — e a criatura, que é
 * o assunto da tela, sumia no meio.
 *
 * O número aqui é grosseiro de propósito: ninguém vai afinar decoração por
 * teste. Ele existe para o dia em que alguém dobrar uma densidade sem perceber
 * que dobrou justamente a coisa que tapa a criatura.
 */
describe('o jardim tem mato, não matagal', () => {
  it('o que fica de pé é a minoria do que há no chão', () => {
    for (const seed of [1337, 7, 99]) {
      const world = createWorld({ width: 900, height: 900 }, seed);
      const props = world.getResource(PropsResource);
      const tall = props.filter((prop) => isTallProp(prop.kind)).length;
      const share = tall / props.length;
      expect(share, `semente ${seed}: ${tall} de ${props.length} em pé`).toBeLessThan(0.16);
    }
  });

  it('e a margem do lago não é uma cerca de juncos', () => {
    const world = createWorld({ width: 900, height: 900 }, 1337);
    const props = world.getResource(PropsResource);
    const reeds = props.filter((prop) => prop.kind === PROP.reed).length;
    expect(reeds, `${reeds} juncos na beira`).toBeLessThan(150);
  });
});
