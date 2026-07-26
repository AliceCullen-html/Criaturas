/**
 * Âncora do cartão flutuante, em coordenadas de tela.
 *
 * É um objeto mutável de propósito: o cartão precisa acompanhar a criatura a
 * 60fps, e passar isso por um store faria o React re-renderizar a cada quadro.
 * Aqui o renderer escreve, e o cartão lê num rAF, mexendo só no `transform`.
 */
export const cardAnchor = { x: 0, y: 0, visible: false };
