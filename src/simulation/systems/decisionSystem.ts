import { clamp, subjects } from '@core';
import { Transform, Velocity, type System } from '@engine';
import { Attributes, Bio, Creature, Emotions, Memory, Mind, Needs, Personality } from '@creatures';
import type { PerceivedCreature, PerceivedFood, Perception } from '@ai';
import {
  AmbientResource,
  Item,
  Plant,
  SceneryResource,
  TerrainResource,
  WeatherResource,
  findNearestWater,
} from '@world';
import { FoodIndexResource } from '../foodIndex';
import { CreatureIndexResource } from '../creatureIndex';
import { BrainResource } from '../brainResource';
import { PlayerResource } from '../player';
import { isBaby } from '../age';

const candidates: number[] = [];
const perceivedCreatures: PerceivedCreature[] = [];
const perceivedFood: PerceivedFood[] = [];
const hiddenSpots: Array<{ x: number; y: number }> = [];
const hunch = { x: 0, y: 0, distance: 0 };
const WANDER_RANGE = 150;
/** Segundos batendo no mesmo obstáculo antes de desistir do alvo. */
const GIVE_UP_AFTER = 1.6;
/** A que distância ela vai dar a volta ao desistir. */
const DETOUR = 70;
const NO_TARGET = -1;

/** O ponto suspeito mais próximo, dentro do alcance da visão. */
function nearestHunch(x: number, y: number, vision: number): typeof hunch | null {
  let best: typeof hunch | null = null;
  for (let i = 0; i < hiddenSpots.length; i++) {
    const spot = hiddenSpots[i]!;
    const distance = Math.hypot(spot.x - x, spot.y - y);
    if (distance > vision || (best && distance >= hunch.distance)) continue;
    hunch.x = spot.x;
    hunch.y = spot.y;
    hunch.distance = distance;
    best = hunch;
  }
  return best;
}

/**
 * Monta a percepção de cada criatura e pede uma decisão ao seu cérebro.
 * O sistema não sabe *como* a decisão é tomada — só aplica o resultado.
 */
export const decisionSystem: System = {
  name: 'decision',
  update(world, dt) {
    const creatures = world.store(Creature);
    const transforms = world.store(Transform);
    const velocities = world.store(Velocity);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const traitsStore = world.store(Personality);
    const attributesStore = world.store(Attributes);
    const bios = world.store(Bio);
    const minds = world.store(Mind);
    const memories = world.store(Memory);
    const plants = world.store(Plant);
    const items = world.store(Item);

    const terrain = world.getResource(TerrainResource);
    const foodIndex = world.getResource(FoodIndexResource);
    const creatureIndex = world.getResource(CreatureIndexResource);
    const brain = world.getResource(BrainResource);
    const player = world.getResource(PlayerResource);
    const ambient = world.getResource(AmbientResource);
    const scenery = world.getResource(SceneryResource);
    const weather = world.getResource(WeatherResource);
    const { rng, config } = world;

    // Objetos que o jogador escondeu atrás de pedras. São poucos, e ficam fora
    // do índice de comida de propósito: só quem procurar encontra.
    hiddenSpots.length = 0;
    items.forEach((item, entity) => {
      if (!item.hidden || item.held) return;
      const transform = transforms.get(entity);
      if (transform) hiddenSpots.push({ x: transform.x, y: transform.y });
    });

    creatures.forEach((_tag, entity) => {
      const mind = minds.get(entity);
      if (!mind) return;

      mind.commitment -= dt;
      mind.actionCooldown = Math.max(0, mind.actionCooldown - dt);

      // Barrada há tempo demais: o plano não vai dar certo por este caminho.
      //
      // Como ninguém calcula rota, insistir contra uma pedra ou contra a
      // margem do lago é um beco sem saída — a criatura fica encostada nele
      // até morrer de fome. Aqui ela faz o que um bicho faria: larga o alvo e
      // dá uma volta, e da próxima vez chega por outro ângulo.
      if (mind.blocked > GIVE_UP_AFTER) {
        mind.blocked = 0;
        mind.commitment = 0;
        mind.intent = 'wander';
        mind.targetEntity = NO_TARGET;
        const transform = transforms.get(entity);
        if (transform) {
          const away = rng.range(0, Math.PI * 2);
          mind.targetX = clamp(transform.x + Math.cos(away) * DETOUR, 4, config.width - 4);
          mind.targetY = clamp(transform.y + Math.sin(away) * DETOUR, 4, config.height - 4);
          mind.commitment = 1.5;
        }
      }

      const transform = transforms.get(entity);
      const velocity = velocities.get(entity);
      const needs = needsStore.get(entity);
      const emotions = emotionsStore.get(entity);
      const traits = traitsStore.get(entity);
      const attributes = attributesStore.get(entity);
      const bio = bios.get(entity);
      const memory = memories.get(entity);
      if (
        !transform ||
        !velocity ||
        !needs ||
        !emotions ||
        !traits ||
        !attributes ||
        !bio ||
        !memory
      ) {
        return;
      }

      // Reavalia só quando o compromisso expira — evita indecisão a cada tick.
      if (mind.commitment <= 0) {
        perceivedCreatures.length = 0;
        creatureIndex.query(transform.x, transform.y, attributes.vision, candidates);
        for (let i = 0; i < candidates.length; i++) {
          const otherId = candidates[i]!;
          if (otherId === entity) continue;
          const otherTransform = transforms.get(otherId);
          const otherTraits = traitsStore.get(otherId);
          const otherAttributes = attributesStore.get(otherId);
          const otherBio = bios.get(otherId);
          if (!otherTransform || !otherTraits || !otherAttributes || !otherBio) continue;
          const distance = Math.hypot(
            otherTransform.x - transform.x,
            otherTransform.y - transform.y,
          );
          if (distance > attributes.vision) continue;
          perceivedCreatures.push({
            id: otherId,
            x: otherTransform.x,
            y: otherTransform.y,
            distance,
            size: otherAttributes.size,
            aggression: otherTraits.aggression,
            isBaby: isBaby(otherBio),
            affinity: memory.valenceOf(subjects.creature(otherId)),
            sex: otherBio.sex,
            fertile: !isBaby(otherBio) && otherBio.matingCooldown <= 0 && otherBio.sex !== bio.sex,
          });
        }

        perceivedFood.length = 0;
        foodIndex.query(transform.x, transform.y, attributes.vision, candidates);
        for (let i = 0; i < candidates.length; i++) {
          const foodId = candidates[i]!;
          const foodTransform = transforms.get(foodId);
          if (!foodTransform) continue;
          const distance = Math.hypot(foodTransform.x - transform.x, foodTransform.y - transform.y);
          if (distance > attributes.vision) continue;

          // Comida pode ser uma planta do chão ou uma fruta caída da árvore.
          const plant = plants.get(foodId);
          const item = items.get(foodId);
          if (!plant && !item) continue;
          if (item && item.held) continue; // na mão do jogador, não é "achável"
          const variant = plant ? plant.variant : item!.variant;

          perceivedFood.push({
            id: foodId,
            x: foodTransform.x,
            y: foodTransform.y,
            distance,
            variant,
            opinion: memory.valenceOf(subjects.food(variant)),
          });
        }

        const water = findNearestWater(terrain, transform.x, transform.y, attributes.vision);
        const playerDistance = player.present
          ? Math.hypot(player.x - transform.x, player.y - transform.y)
          : Infinity;

        const perception: Perception = {
          self: {
            id: entity,
            x: transform.x,
            y: transform.y,
            age: bio.age,
            isBaby: isBaby(bio),
            needs,
            emotions,
            personality: traits,
            attributes,
            memory,
            matingCooldown: bio.matingCooldown,
          },
          creatures: perceivedCreatures,
          food: perceivedFood,
          water,
          player: {
            x: player.x,
            y: player.y,
            present: player.present && playerDistance < attributes.vision * 1.5,
          },
          placeDanger: Math.max(0, -memory.valenceOf(subjects.place(transform.x, transform.y))),
          attention: mind.attention,
          ambient: nearestAmbient(ambient, transform.x, transform.y, attributes.vision),
          shelter: nearestTree(scenery, transform.x, transform.y),
          hunch: nearestHunch(transform.x, transform.y, attributes.vision),
          rain: weather.intensity,
        };

        const decision = brain.decide(perception);
        mind.intent = decision.intent;
        mind.targetEntity = decision.targetEntity;
        mind.commitment = decision.commitment;

        if (decision.intent === 'wander') {
          mind.targetX = clamp(
            transform.x + rng.range(-WANDER_RANGE, WANDER_RANGE),
            4,
            config.width - 4,
          );
          mind.targetY = clamp(
            transform.y + rng.range(-WANDER_RANGE, WANDER_RANGE),
            4,
            config.height - 4,
          );
        } else {
          mind.targetX = decision.targetX;
          mind.targetY = decision.targetY;
        }
      }

      // Alvos móveis (outra criatura, jogador) são reacompanhados a cada tick.
      if (mind.targetEntity >= 0) {
        const targetTransform = transforms.get(mind.targetEntity);
        if (targetTransform) {
          mind.targetX = targetTransform.x;
          mind.targetY = targetTransform.y;
        } else {
          mind.commitment = 0;
        }
      } else if (mind.intent === 'approachPlayer' && player.present) {
        mind.targetX = player.x;
        mind.targetY = player.y;
      }

      // Traduz a intenção em movimento.
      if (mind.intent === 'sleep') {
        velocity.x = 0;
        velocity.y = 0;
        return;
      }

      const dx = mind.targetX - transform.x;
      const dy = mind.targetY - transform.y;
      const distance = Math.hypot(dx, dy);
      // Observar é de longe: ninguém persegue uma borboleta até encostar.
      // Procurar e acasalar são o contrário de observar: exigem encostar. Parar
      // a `size` de distância deixava as maiores sem nunca alcançar o par.
      const stopAt =
        mind.intent === 'seekFood' ||
        mind.intent === 'seekWater' ||
        mind.intent === 'search' ||
        mind.intent === 'mate'
          ? 2
          : mind.intent === 'watch'
            ? 34
            : mind.intent === 'follow'
              ? attributes.size * 2.2
              : attributes.size;

      if (distance < stopAt) {
        velocity.x = 0;
        velocity.y = 0;
        return;
      }

      const haste =
        mind.intent === 'flee'
          ? 1.45
          : mind.intent === 'attack' || mind.intent === 'play'
            ? 1.15
            : 1;
      const tired = needs.energy < 0.25 ? 0.55 : 1;
      const speed = attributes.speed * haste * tired;
      velocity.x = (dx / distance) * speed;
      velocity.y = (dy / distance) * speed;
    });
  },
};

/** Bichinho de ambiente mais próximo dentro do campo de visão. */
function nearestAmbient(
  beings: ReadonlyArray<{ x: number; y: number }>,
  x: number,
  y: number,
  vision: number,
): { x: number; y: number; distance: number } | null {
  let best: { x: number; y: number; distance: number } | null = null;
  for (const being of beings) {
    const distance = Math.hypot(being.x - x, being.y - y);
    if (distance > vision) continue;
    if (!best || distance < best.distance) best = { x: being.x, y: being.y, distance };
  }
  return best;
}

/** Árvore mais próxima — abrigo natural contra a chuva. */
function nearestTree(
  scenery: ReadonlyArray<{ kind: string; x: number; y: number }>,
  x: number,
  y: number,
): { x: number; y: number; distance: number } | null {
  let best: { x: number; y: number; distance: number } | null = null;
  for (const piece of scenery) {
    if (piece.kind !== 'tree') continue;
    const distance = Math.hypot(piece.x - x, piece.y - y);
    if (!best || distance < best.distance) best = { x: piece.x, y: piece.y + 6, distance };
  }
  return best;
}
