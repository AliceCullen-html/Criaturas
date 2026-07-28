import { CreatureRenderBuffer, Transform, Velocity, type World } from '@engine';
import { Ball, Item } from '@world';
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

/** Distâncias que separam olhar de perseguir, de empurrar. */
const PLAY_TOUCH = 22;
const PLAY_NEAR = 70;

/**
 * QUAL QUADRO DE BRINCAR, se ela estiver brincando com a bola.
 *
 * A ficha da folha nomeia cinco: olha, empurra, pula, abraça, persegue. A
 * escolha sai da distância e do que ela acabou de fazer — parada de longe ela
 * arma a PERSEGUIÇÃO, chegando perto OLHA, encostada PULA ou ABRAÇA.
 *
 * ANDANDO, quem manda é a caminhada. Este é o ponto que estava errado: a pose
 * de brincar cobria tudo, inclusive a corrida atrás da bola, e uma criatura
 * atravessava o jardim inteiro num desenho só — pernas paradas, deslizando no
 * chão. Um quadro fixo em cima de um corpo que anda é o contrário de animação.
 * A única pose que atropela a caminhada é o EMPURRÃO, e por um instante só:
 * é o gesto em si, e ele precisa ser visto.
 */
function playFrame(
  world: World,
  mind: { intent: string; targetEntity: number; actionCooldown: number },
  transform: { x: number; y: number },
  moving: boolean,
): number {
  if (mind.intent !== 'play' || mind.targetEntity < 0) return 0;
  if (!world.hasComponent(Ball)) return 0;
  const ball = world.store(Ball).get(mind.targetEntity);
  if (!ball) return 0;
  const spot = world.store(Transform).get(mind.targetEntity);
  if (!spot) return 0;

  // Acabou de empurrar: o quadro do empurrão fica um instante no ar.
  if (mind.actionCooldown > 0.55) return 2;
  if (moving) return 0;

  const distance = Math.hypot(spot.x - transform.x, spot.y - transform.y);
  if (distance > PLAY_NEAR) return 5;
  if (distance > PLAY_TOUCH) return 1;
  // Coladinha: se a bola está no alto, ela pula atrás; no chão, abraça.
  return ball.z > 14 ? 3 : 4;
}

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
      playFrame(world, mind, transform, moving),
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
      0,
    );
  });
}
