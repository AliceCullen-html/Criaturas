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

/**
 * A BRINCADEIRA DELA É COM UMA BOLA?
 *
 * "Brincar" é uma intenção só e quatro brincadeiras diferentes: a bola largada
 * no chão, um amigo por perto, a mão do jogador e a chuva. Do lado do desenho
 * existe uma animação de brincar, e ela tem uma BOLA dentro — o artista
 * desenhou a cena, não a pose. Enquanto o renderer via só a intenção, um
 * filhote recém-nascido que estava feliz perto do jogador aparecia chutando uma
 * bola que ninguém tinha dado a ele.
 *
 * Quem sabe se a bola existe é a simulação, e responder isso é o trabalho desta
 * função: uma bola de verdade, no chão, que é justamente o alvo dela.
 */
function playsWithBall(world: World, mind: { intent: string; targetEntity: number }): 0 | 1 {
  if (mind.intent !== 'play' || mind.targetEntity < 0) return 0;
  if (!world.hasComponent(Ball)) return 0;
  if (!world.store(Ball).get(mind.targetEntity)) return 0;
  // Na mão de alguém não dá para brincar, e sem lugar no mundo não há o que
  // desenhar ao lado dela.
  const item = world.store(Item).get(mind.targetEntity);
  if (!item || item.held || item.carriedBy >= 0) return 0;
  return world.store(Transform).get(mind.targetEntity) ? 1 : 0;
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
      ball: playsWithBall(world, mind),
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
      ball: 0,
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
