import { RenderBuffer, Transform, type World } from '@engine';
import { Item, itemRadius } from '@world';

/** Projeta os objetos físicos (frutas, brinquedos) para o renderer. */
export function writeItemBuffer(world: World, buffer: RenderBuffer): void {
  const transforms = world.store(Transform);
  buffer.clear();
  world.store(Item).forEach((item, entity) => {
    const transform = transforms.get(entity);
    if (!transform) return;
    // Frutas passadas ficam menores e mais opacas — o "color" carrega o frescor.
    buffer.push(
      transform.x,
      transform.y,
      transform.prevX,
      transform.prevY,
      itemRadius(item),
      Math.round(item.freshness * 255),
      item.variant,
    );
  });
}
