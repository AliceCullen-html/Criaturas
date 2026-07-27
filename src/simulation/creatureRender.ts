import { CreatureRenderBuffer, Transform, Velocity, type World } from '@engine';
import { Item } from '@world';
import { Appearance, Attributes, Behavior, Bio, Creature, Egg, Mind, type Mood } from '@creatures';
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

const carrying = new Set<number>();

/** Marca de "esta linha é uma criatura, não um ovo". */
const NOT_AN_EGG = -1;

/** Projeta as criaturas no buffer de render (posição, aparência, humor, fase). */
export function writeCreatureBuffer(world: World, buffer: CreatureRenderBuffer): void {
  const creatures = world.store(Creature);
  const transforms = world.store(Transform);
  const attributes = world.store(Attributes);
  const appearances = world.store(Appearance);
  const minds = world.store(Mind);
  const bios = world.store(Bio);
  const velocities = world.store(Velocity);
  const behaviors = world.store(Behavior);

  // Quem está com alguma coisa na boca. Uma passada só pela lista de objetos,
  // em vez de uma busca por criatura — são poucos objetos e muitas criaturas.
  carrying.clear();
  world.store(Item).forEach((item) => {
    if (item.carriedBy >= 0) carrying.add(item.carriedBy);
  });

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
    const behavior = behaviors.get(entity);
    const pose = behavior?.pose ?? 0;
    const poseTime =
      behavior && behavior.duration > 0 ? Math.min(1, behavior.elapsed / behavior.duration) : 0;

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
      pose,
      poseTime,
      carrying.has(entity) ? 1 : 0,
      NOT_AN_EGG,
    );
  });

  // Os ovos entram na mesma lista. Eles não são criaturas — nenhum sistema do
  // jogo os enxerga —, mas ESTÃO no jardim, e quem desenha o jardim precisa
  // deles. O canal `egg` diz ao renderer que aquele slot é uma casca.
  if (!world.hasComponent(Egg)) return;
  world.store(Egg).forEach((egg, entity) => {
    const transform = transforms.get(entity);
    const attribute = attributes.get(entity);
    const appearance = appearances.get(entity);
    const bio = bios.get(entity);
    if (!transform || !attribute || !appearance || !bio) return;

    buffer.push(
      entity,
      transform.x,
      transform.y,
      transform.prevX,
      transform.prevY,
      // Um ovo não cresce com a idade: é do tamanho que é.
      attribute.size,
      appearance.bodyColor,
      appearance.eyeColor,
      appearance.accentColor,
      appearance.features,
      appearance.speciesIndex,
      0,
      0,
      0,
      0,
      0,
      0,
      Math.min(1, egg.time / egg.duration),
    );
  });
}
