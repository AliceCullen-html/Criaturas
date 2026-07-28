import { describe, it, expect } from 'vitest';
import { FACING, headingOf, idleFrame, walkFrame } from './textures/tintimSheet';
import { ISO_SQUASH } from './iso';

/**
 * PARA ONDE ELA ESTÁ INDO.
 *
 * O mundo é isométrico, e é aí que mora a armadilha: **andar para o leste do
 * mundo não é andar para a direita da tela**. Um passo em `+x` sobe e vai para
 * a direita; um passo em `+y` desce e vai para a esquerda. Quem escolhe o
 * desenho precisa raciocinar em coordenadas de TELA, senão a criatura anda para
 * um lado e olha para outro — que é o tipo de erro que ninguém consegue
 * explicar olhando, só sentir.
 *
 * Por isso este teste faz o caminho inteiro: pega um passo em coordenadas de
 * MUNDO, projeta como o renderer projeta, e cobra o desenho que o jogador
 * deveria ver.
 */

/** O mesmo que o renderer faz: um passo do mundo vira um vetor de tela. */
const naTela = (dx: number, dy: number): [number, number] => [dx - dy, (dx + dy) * ISO_SQUASH];

const rumo = (dx: number, dy: number) => headingOf(...naTela(dx, dy));

describe('a direção do passo escolhe o desenho', () => {
  it('as oito direções do mundo saem dos cinco desenhos', () => {
    // Andando para +x e +y ao mesmo tempo, ela vem PARA BAIXO na tela: é o sul,
    // que é a folha inteira de frente.
    expect(rumo(1, 1).facing, 'vindo para a frente não é o desenho de frente').toBe(FACING.s);
    expect(rumo(1, 1).mirror).toBe(false);

    // E indo para -x e -y ela vai para o fundo: de costas.
    expect(rumo(-1, -1).facing, 'indo para o fundo não é o desenho de costas').toBe(FACING.n);

    // +x sozinho DESCE pela direita — e é aqui que a intuição erra: no mundo
    // isso é "leste", mas na tela isométrica o eixo x vai para baixo e para a
    // direita. Sudeste.
    expect(rumo(1, 0).facing).toBe(FACING.se);
    expect(rumo(1, 0).mirror, 'o sudeste é desenhado, não espelhado').toBe(false);

    // +y desce pela esquerda: sudoeste — o sudeste virado.
    expect(rumo(0, 1).facing).toBe(FACING.se);
    expect(rumo(0, 1).mirror, 'o sudoeste tem de ser o sudeste virado').toBe(true);

    // -y sobe pela direita: nordeste.
    expect(rumo(0, -1).facing).toBe(FACING.ne);
    expect(rumo(0, -1).mirror).toBe(false);

    // -x sobe pela esquerda: noroeste — o nordeste virado.
    expect(rumo(-1, 0).facing).toBe(FACING.ne);
    expect(rumo(-1, 0).mirror, 'o noroeste tem de ser o nordeste virado').toBe(true);

    // E o leste da TELA, que é o que o jogador chama de "para a direita", sai
    // de andar em +x e -y ao mesmo tempo: os dois eixos do mundo se cancelam
    // na vertical e sobra o movimento horizontal puro.
    expect(rumo(1, -1).facing).toBe(FACING.e);
    expect(rumo(1, -1).mirror).toBe(false);
    expect(rumo(-1, 1).facing).toBe(FACING.e);
    expect(rumo(-1, 1).mirror, 'o oeste da tela é o leste virado').toBe(true);
  });

  it('o leste e o oeste da TELA são o mesmo desenho, um espelhado', () => {
    // Em coordenadas de tela puras: para a direita e para a esquerda.
    const direita = headingOf(1, 0);
    const esquerda = headingOf(-1, 0);
    expect(direita.facing).toBe(FACING.e);
    expect(esquerda.facing).toBe(FACING.e);
    expect(direita.mirror).toBe(false);
    expect(esquerda.mirror, 'o oeste precisa ser o leste virado').toBe(true);
  });

  it('parada, ela continua virada para onde estava indo', () => {
    // Um vetor nulo não muda de rumo: quem para de andar não gira sozinha.
    expect(headingOf(0, 0).facing).toBe(FACING.s);
  });

  it('cada direção tem desenho parado e ciclo de passos, e são diferentes', () => {
    const vistos = new Set<number>();
    for (const facing of [FACING.s, FACING.se, FACING.e, FACING.ne, FACING.n]) {
      vistos.add(idleFrame(facing));
      // O ciclo dá a volta: o passo seguinte ao último é o primeiro de novo.
      const ciclo = [0, 1, 2].map((step) => walkFrame(facing, step));
      expect(new Set(ciclo).size, `a direção ${facing} repete o mesmo quadro`).toBeGreaterThan(1);
      for (const quadro of ciclo) vistos.add(quadro);
    }
    // Cinco desenhos parados distintos: se dois fossem iguais, duas direções
    // seriam indistinguíveis quando ela para.
    expect(vistos.size, 'direções diferentes usando os mesmos quadros').toBeGreaterThan(10);
  });
});
