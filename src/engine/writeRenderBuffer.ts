import { Sprite, Transform } from './components';
import type { RenderBuffer } from './renderBuffer';
import type { World } from './world';

/**
 * Projeta as entidades desenháveis (Transform + Sprite) no `RenderBuffer`
 * somente-leitura. Reutiliza o buffer — sem alocação por quadro.
 */
export function writeRenderBuffer(world: World, buffer: RenderBuffer): void {
  const transforms = world.store(Transform);
  const sprites = world.store(Sprite);

  buffer.clear();
  sprites.forEach((sprite, entity) => {
    const transform = transforms.get(entity);
    if (!transform) return;
    buffer.push(
      transform.x,
      transform.y,
      transform.prevX,
      transform.prevY,
      sprite.radius,
      sprite.color,
    );
  });
}
