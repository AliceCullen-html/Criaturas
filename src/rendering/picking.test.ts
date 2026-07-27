import { describe, it, expect } from 'vitest';
import { ISO_SQUASH, isoX, isoY } from './iso';

/**
 * ONDE O DEDO ENCOSTA.
 *
 * O bug que este arquivo existe para impedir era invisível e travava o jogo
 * inteiro: **não dava para arrastar nada**. A causa não estava no arrasto, mas
 * na mira. O ponteiro devolve um ponto do CHÃO — a casa em que o dedo pousou.
 * Uma árvore, porém, não está deitada no chão: ela sobe pela tela. Encostar no
 * meio da copa devolvia um ponto do mundo uma casa e meia atrás da árvore, e a
 * pergunta "que peça está nesse ponto?" respondia *nenhuma*.
 *
 * A conta correta desfaz a projeção: converte o ponto do mundo de volta para o
 * deslocamento em TELA relativo ao pé da peça, e compara com o retângulo que o
 * sprite ocupa. O que se cobra aqui é essa conta — de forma independente do
 * renderer, que precisa de um navegador para existir.
 */

/** A mesma regra de `createRenderer.insideSprite`, isolada para teste. */
function insideSprite(
  worldX: number,
  worldY: number,
  footX: number,
  footY: number,
  halfWidth: number,
  up: number,
  down: number,
): boolean {
  const dx = worldX - footX;
  const dy = worldY - footY;
  const screenX = dx - dy;
  const screenY = (dx + dy) * ISO_SQUASH;
  return Math.abs(screenX) <= halfWidth && screenY <= down + 2 && screenY >= -up;
}

/**
 * Uma árvore como o jogo desenha hoje: textura de 96×126 a 0,8 de escala, com
 * o pé a 94% da altura.
 */
const TREE = { halfWidth: (96 * 0.8) / 2, up: 126 * 0.8 * 0.94, down: 126 * 0.8 * 0.06 };

/**
 * De um ponto na TELA (relativo ao pé da peça) para o ponto do mundo que o
 * ponteiro devolveria ali. É o inverso exato da projeção.
 */
function worldUnderScreen(
  footX: number,
  footY: number,
  screenDx: number,
  screenDy: number,
): { x: number; y: number } {
  const sum = screenDy / ISO_SQUASH;
  return { x: footX + (sum + screenDx) / 2, y: footY + (sum - screenDx) / 2 };
}

describe('mirar no que está desenhado', () => {
  const footX = 300;
  const footY = 300;

  it('encostar na copa acerta a árvore, não o chão atrás dela', () => {
    // 60 pixels acima do pé é o meio da copa — a parte mais visível da árvore.
    const point = worldUnderScreen(footX, footY, 0, -60);
    expect(insideSprite(point.x, point.y, footX, footY, TREE.halfWidth, TREE.up, TREE.down)).toBe(
      true,
    );

    // E o ponto do mundo ali é MESMO longe do pé: é isso que fazia o teste
    // ingênuo (distância no chão) falhar.
    expect(Math.hypot(point.x - footX, point.y - footY)).toBeGreaterThan(80);
  });

  it('a árvore inteira é alvo, do tronco ao topo', () => {
    // O topo do sprite fica a 94,75px do pé (126 × 0,8 × 0,94); a varredura
    // vai até 90 para não cobrar o próprio limite.
    for (let screenDy = -90; screenDy <= 5; screenDy += 5) {
      const point = worldUnderScreen(footX, footY, 0, screenDy);
      expect(
        insideSprite(point.x, point.y, footX, footY, TREE.halfWidth, TREE.up, TREE.down),
        `falhou a ${-screenDy}px acima do pé`,
      ).toBe(true);
    }
  });

  it('o chão em volta não é a árvore', () => {
    // Bem acima do topo.
    const above = worldUnderScreen(footX, footY, 0, -130);
    expect(insideSprite(above.x, above.y, footX, footY, TREE.halfWidth, TREE.up, TREE.down)).toBe(
      false,
    );
    // Ao lado, fora da largura do sprite.
    const beside = worldUnderScreen(footX, footY, 60, -20);
    expect(insideSprite(beside.x, beside.y, footX, footY, TREE.halfWidth, TREE.up, TREE.down)).toBe(
      false,
    );
  });

  it('a mira não depende do zoom — ela vive em coordenadas de mundo', () => {
    // A conta usa só o mundo e o tamanho do sprite; nenhum termo de câmera
    // aparece nela. Este teste fixa isso: o mesmo ponto da copa acerta esteja
    // a árvore onde estiver no jardim.
    for (const [fx, fy] of [
      [50, 50],
      [420, 880],
      [899, 12],
    ] as const) {
      const point = worldUnderScreen(fx, fy, 0, -60);
      expect(insideSprite(point.x, point.y, fx, fy, TREE.halfWidth, TREE.up, TREE.down)).toBe(true);
    }
  });

  it('a projeção e seu inverso fecham', () => {
    for (const [x, y] of [
      [0, 0],
      [123, 456],
      [900, 900],
    ] as const) {
      const sx = isoX(x, y);
      const sy = isoY(x, y);
      const sum = sy / ISO_SQUASH;
      expect((sum + sx) / 2).toBeCloseTo(x, 6);
      expect((sum - sx) / 2).toBeCloseTo(y, 6);
    }
  });
});
