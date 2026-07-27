/**
 * Projeção isométrica.
 *
 * A simulação continua em coordenadas cartesianas de cima — ela não sabe nem
 * precisa saber como é desenhada. A vista em perspectiva mora inteira aqui, no
 * renderer, e é só uma troca de eixos:
 *
 *   tela.x = mundo.x − mundo.y
 *   tela.y = (mundo.x + mundo.y) / 2
 *
 * É a clássica 2:1 — cada quadrado do chão vira um losango com o dobro de
 * largura da altura, que é o que dá a sensação de volume sem custar um motor 3D.
 *
 * O desenho se divide em duas famílias, e é essa divisão que faz tudo encaixar:
 *
 * - **O CHÃO** (grama, areia, água, sombras, ondas, poças) vive num container
 *   com esta matriz aplicada. As coordenadas lá dentro continuam cartesianas, e
 *   o Pixi projeta de graça: quadrados viram losangos, círculos viram elipses
 *   achatadas na medida certa.
 * - **O QUE FICA EM PÉ** (criaturas, árvores, objetos) NÃO pode ser inclinado —
 *   uma criatura girada 45° não é isométrica, é uma criatura tombada. Esses
 *   ficam num container sem transformação, e é a POSIÇÃO deles que passa por
 *   aqui. O sprite continua de frente para quem olha.
 */

/** Meia-altura do losango. 0.5 = proporção 2:1, a mais legível em pixel art. */
export const ISO_SQUASH = 0.5;

export const isoX = (x: number, y: number): number => x - y;
export const isoY = (x: number, y: number): number => (x + y) * ISO_SQUASH;

/**
 * Volta da tela para o mundo — o inverso exato, para o clique cair onde o
 * jogador enxergou.
 */
export function unIso(screenX: number, screenY: number): { x: number; y: number } {
  const sum = screenY / ISO_SQUASH; // x + y
  return { x: (sum + screenX) / 2, y: (sum - screenX) / 2 };
}

/**
 * Profundidade: em vista isométrica quem está mais "para a frente" é quem tem
 * a maior soma x+y, não o maior y. Trocar isso é o que impede a árvore do fundo
 * de ser desenhada por cima da criatura da frente.
 */
export const isoDepth = (x: number, y: number): number => x + y;

/** Matriz do container de chão: (1, 0.5) para o eixo x, (−1, 0.5) para o y. */
export const ISO_MATRIX = {
  a: 1,
  b: ISO_SQUASH,
  c: -1,
  d: ISO_SQUASH,
  tx: 0,
  ty: 0,
} as const;
