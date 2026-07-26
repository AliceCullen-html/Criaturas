import { CreatureRenderBuffer, Transform, Velocity, type World } from '@engine';
import { Appearance, Attributes, Bio, Creature, Mind, type Mood } from '@creatures';
import { growthScale, lifeStage } from './age';

/** Códigos de expressão consumidos pelo renderer. */
const MOOD_CODES: Record<Mood, number> = {
  neutral: 0,
  happy: 1,
  needy: 2,
  sleepy: 3,
  surprised: 4,
  angry: 5,
  sad: 6,
  loved: 7,
  afraid: 8,
  curious: 9,
  hungry: 10,
  thirsty: 11,
  playful: 12,
};

/** Projeta as criaturas no buffer de render (posição, aparência, humor, fase). */
export function writeCreatureBuffer(world: World, buffer: CreatureRenderBuffer): void {
  const creatures = world.store(Creature);
  const transforms = world.store(Transform);
  const attributes = world.store(Attributes);
  const appearances = world.store(Appearance);
  const minds = world.store(Mind);
  const bios = world.store(Bio);
  const velocities = world.store(Velocity);

  buffer.clear();
  creatures.forEach((_tag, entity) => {
    const transform = transforms.get(entity);
    const attribute = attributes.get(entity);
    const appearance = appearances.get(entity);
    const mind = minds.get(entity);
    const bio = bios.get(entity);
    if (!transform || !attribute || !appearance || !mind || !bio) return;

    const velocity = velocities.get(entity);
    const moving = velocity ? velocity.x !== 0 || velocity.y !== 0 : false;

    buffer.push(
      entity,
      transform.x,
      transform.y,
      transform.prevX,
      transform.prevY,
      attribute.size * growthScale(bio),
      appearance.bodyColor,
      appearance.eyeColor,
      appearance.accentColor,
      appearance.features,
      appearance.speciesIndex,
      MOOD_CODES[mind.mood],
      lifeStage(bio),
      moving ? 1 : 0,
    );
  });
}
