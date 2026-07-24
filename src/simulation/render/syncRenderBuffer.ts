import type { RenderBuffer, World } from '@engine';
import { Position, Renderable } from '../components';

/**
 * Projeta o estado atual da simulação no `RenderBuffer` (somente-leitura para
 * o renderer). Reutiliza o buffer — sem alocação por quadro.
 */
export function syncRenderBuffer(world: World, buffer: RenderBuffer): void {
  const positions = world.store(Position);
  const renderables = world.store(Renderable);

  buffer.clear();
  renderables.forEach((renderable, entity) => {
    const position = positions.get(entity);
    if (!position) return;
    buffer.push(
      position.x,
      position.y,
      position.prevX,
      position.prevY,
      renderable.radius,
      renderable.color,
    );
  });
}
