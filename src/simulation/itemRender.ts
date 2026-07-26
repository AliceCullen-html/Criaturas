import { RenderBuffer, Transform, type World } from '@engine';
import { Item, STACK_STEP, itemRadius } from '@world';

/** Bit de "escondido" acima do byte de frescor, no campo `color` do buffer. */
export const HIDDEN_FLAG = 256;

/** Projeta os objetos físicos (frutas, brinquedos) para o renderer. */
export function writeItemBuffer(world: World, buffer: RenderBuffer): void {
  const transforms = world.store(Transform);
  buffer.clear();
  world.store(Item).forEach((item, entity) => {
    const transform = transforms.get(entity);
    if (!transform) return;
    // Empilhado, o objeto é desenhado acima do que está embaixo dele. O deslocamento
    // vale também para o hit-test: pegar a pilha pega a peça de cima.
    const lift = item.stack * STACK_STEP;
    // Frutas passadas ficam menores e mais opacas — o "color" carrega o frescor,
    // e o bit acima dele diz se o objeto está escondido.
    buffer.push(
      transform.x,
      transform.y - lift,
      transform.prevX,
      transform.prevY - lift,
      itemRadius(item),
      Math.round(item.freshness * 255) | (item.hidden ? HIDDEN_FLAG : 0),
      item.variant,
    );
  });
}
