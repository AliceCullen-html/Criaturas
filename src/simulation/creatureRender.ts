import { CreatureRenderBuffer, Transform, type World } from '@engine';
import { Appearance, Attributes, Creature } from '@creatures';

/** Projeta as criaturas no `CreatureRenderBuffer` (id + posição + aparência). */
export function writeCreatureBuffer(world: World, buffer: CreatureRenderBuffer): void {
  const creatures = world.store(Creature);
  const transforms = world.store(Transform);
  const attributes = world.store(Attributes);
  const appearances = world.store(Appearance);

  buffer.clear();
  creatures.forEach((_tag, entity) => {
    const transform = transforms.get(entity);
    const attribute = attributes.get(entity);
    const appearance = appearances.get(entity);
    if (!transform || !attribute || !appearance) return;
    buffer.push(
      entity,
      transform.x,
      transform.y,
      transform.prevX,
      transform.prevY,
      attribute.size,
      appearance.bodyColor,
      appearance.eyeColor,
    );
  });
}
