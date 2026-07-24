import { CreatureRenderBuffer, Transform, type World } from '@engine';
import { Appearance, Attributes, Bio, Creature, Mind, type Mood } from '@creatures';
import { growthScale } from './age';

const MOOD_CODES: Record<Mood, number> = {
  neutral: 0,
  happy: 1,
  afraid: 2,
  sad: 3,
  sleeping: 4,
  angry: 5,
};

/** Projeta as criaturas no buffer de render (posição, aparência e humor). */
export function writeCreatureBuffer(world: World, buffer: CreatureRenderBuffer): void {
  const creatures = world.store(Creature);
  const transforms = world.store(Transform);
  const attributes = world.store(Attributes);
  const appearances = world.store(Appearance);
  const minds = world.store(Mind);
  const bios = world.store(Bio);

  buffer.clear();
  creatures.forEach((_tag, entity) => {
    const transform = transforms.get(entity);
    const attribute = attributes.get(entity);
    const appearance = appearances.get(entity);
    const mind = minds.get(entity);
    const bio = bios.get(entity);
    if (!transform || !attribute || !appearance || !mind || !bio) return;
    buffer.push(
      entity,
      transform.x,
      transform.y,
      transform.prevX,
      transform.prevY,
      attribute.size * growthScale(bio),
      appearance.bodyColor,
      appearance.eyeColor,
      appearance.features,
      MOOD_CODES[mind.mood],
    );
  });
}
