import { INTENT, MOOD } from '@core';
import { CreatureRenderBuffer, Transform, Velocity, type World } from '@engine';
import { Ball, Item } from '@world';
import {
  Appearance,
  Attributes,
  Behavior,
  Bio,
  Creature,
  Carried,
  Egg,
  Falling,
  Emotions,
  Mind,
  Needs,
} from '@creatures';
import { growthScale, lifeStage } from './age';

const carrying = new Set<number>();
/** Quem está no colo do jogador — reaproveitado a cada tique, como o de cima. */
const inHand = new Set<number>();

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
  const emotions = world.store(Emotions);
  const needs = world.store(Needs);
  // Quem está no colo do jogador. O renderer precisa saber: no ar, a criatura
  // não anda, não gesticula e é desenhada erguida, presa à mão.
  const hands = world.hasComponent(Carried) ? world.store(Carried) : null;
  inHand.clear();
  hands?.forEach((_held, entity) => inHand.add(entity));
  // E quem está caindo — no ar também, mas sem ninguém segurando.
  const falls = world.hasComponent(Falling) ? world.store(Falling) : null;

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

    const emotion = emotions.get(entity);
    const need = needs.get(entity);

    buffer.push({
      id: entity,
      x: transform.x,
      y: transform.y,
      prevX: transform.prevX,
      prevY: transform.prevY,
      size: attribute.size * growthScale(bio),
      bodyColor: appearance.bodyColor,
      eyeColor: appearance.eyeColor,
      accentColor: appearance.accentColor,
      dna: appearance.features,
      species: appearance.speciesIndex,
      mood: MOOD[mind.mood],
      stage: lifeStage(bio),
      moving: moving ? 1 : 0,
      pose,
      poseTime,
      carrying: carrying.has(entity) ? 1 : 0,
      egg: NOT_AN_EGG,
      playing: playFrame(world, mind, transform, moving),
      intent: INTENT[mind.intent],
      carried: inHand.has(entity) ? 1 : 0,
      lift: hands?.get(entity)?.z ?? falls?.get(entity)?.z ?? 0,
      prevLift: hands?.get(entity)?.prevZ ?? falls?.get(entity)?.prevZ ?? 0,
      scar: emotion?.scar ?? 0,
      fear: emotion?.fear ?? 0,
      happiness: emotion?.happiness ?? 0.5,
      energy: need?.energy ?? 1,
      health: need?.health ?? 1,
    });
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

    buffer.push({
      id: entity,
      x: transform.x,
      y: transform.y,
      prevX: transform.prevX,
      prevY: transform.prevY,
      // Um ovo não cresce com a idade: é do tamanho que é.
      size: attribute.size,
      bodyColor: appearance.bodyColor,
      eyeColor: appearance.eyeColor,
      accentColor: appearance.accentColor,
      dna: appearance.features,
      species: appearance.speciesIndex,
      mood: 0,
      stage: 0,
      moving: 0,
      pose: 0,
      poseTime: 0,
      carrying: 0,
      egg: Math.min(1, egg.time / egg.duration),
      playing: 0,
      intent: 0,
      carried: 0,
      lift: 0,
      prevLift: 0,
      scar: 0,
      fear: 0,
      happiness: 0.5,
      energy: 1,
      health: 1,
    });
  });
}
