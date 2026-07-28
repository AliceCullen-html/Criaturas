import { POSE, POSE_DURATION, clamp01, subjects } from '@core';
import { Transform, type System } from '@engine';
import {
  Attributes,
  Behavior,
  Bio,
  Creature,
  Emotions,
  Identity,
  Memory,
  Mind,
  Needs,
  Personality,
} from '@creatures';
import {
  Ball,
  Item,
  Plant,
  RESOURCE_NAMES,
  isToxicVariant,
  itemRadius,
  radiusForBiomass,
} from '@world';
import { isBaby } from '../age';

const EAT_RATE = 3.2;
const NUTRITION = 0.21;
const PLANT_MIN_BIOMASS = 0.4;
const TOXIN_DAMAGE = 0.22;
const INTERACT_COOLDOWN = 2.5;

const eaten: number[] = [];

/**
 * Executa a intenção quando a criatura chega ao alvo, e — o mais importante —
 * registra a **consequência** na memória. É o elo que transforma experiência
 * em comportamento futuro.
 */
export const actionSystem: System = {
  name: 'action',
  update(world, dt) {
    const creatures = world.store(Creature);
    const transforms = world.store(Transform);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const attributesStore = world.store(Attributes);
    const traitsStore = world.store(Personality);
    const minds = world.store(Mind);
    const memories = world.store(Memory);
    const identities = world.store(Identity);
    const bios = world.store(Bio);
    const behaviors = world.store(Behavior);
    const plants = world.store(Plant);
    const items = world.store(Item);

    eaten.length = 0;

    creatures.forEach((_tag, entity) => {
      const mind = minds.get(entity);
      const transform = transforms.get(entity);
      const memory = memories.get(entity);
      const needs = needsStore.get(entity);
      const emotions = emotionsStore.get(entity);
      const attributes = attributesStore.get(entity);
      if (!mind || !transform || !memory || !needs || !emotions || !attributes) return;

      switch (mind.intent) {
        case 'seekFood': {
          const foodId = mind.targetEntity;
          const foodTransform = transforms.get(foodId);
          if (!foodTransform) break;
          const plant = plants.get(foodId);
          const item = items.get(foodId);
          if (!plant && !item) break;
          if (item?.held) {
            mind.commitment = 0;
            break;
          }

          const foodRadius = plant ? radiusForBiomass(plant.biomass) : itemRadius(item!);
          const distance = Math.hypot(foodTransform.x - transform.x, foodTransform.y - transform.y);
          if (distance > attributes.size + foodRadius + 2) break;

          const variant = plant ? plant.variant : item!.variant;
          const toxic = plant ? isToxicVariant(variant) : item!.toxic;
          const bite = Math.min(EAT_RATE * dt, plant ? plant.biomass : 5 * item!.freshness);
          // COMENDO: a boca abre e fecha enquanto a mordida acontece. A pose é
          // reposta a cada tique e dura meio segundo além da última mordida —
          // assim a animação existe enquanto a refeição existe, sem que ninguém
          // precise cronometrar nada.
          const behavior = behaviors.get(entity);
          if (behavior) {
            behavior.pose = POSE.eat;
            behavior.elapsed = 0;
            behavior.duration = POSE_DURATION[POSE.eat] ?? 0.8;
          }
          if (plant) plant.biomass -= bite;
          needs.hunger = clamp01(needs.hunger - bite * NUTRITION);

          if (toxic) {
            // Consequência ruim → memória negativa forte daquele alimento.
            needs.health = clamp01(needs.health - TOXIN_DAMAGE * bite);
            emotions.stress = clamp01(emotions.stress + 0.35 * bite);
            emotions.happiness = clamp01(emotions.happiness - 0.2 * bite);
            memory.record(subjects.food(variant), -1, 0.5 * bite);
            if (bite > 0.05) {
              memory.addEpisode({
                text: `Comi ${nameOf(variant)} e passei mal`,
                valence: -0.8,
                intensity: 0.75,
                emotion: 'mal-estar',
                tick: world.tick,
                x: transform.x,
                y: transform.y,
              });
            }
          } else {
            memory.record(subjects.food(variant), 0.6, 0.25 * bite);
            emotions.happiness = clamp01(emotions.happiness + 0.05 * bite);
          }

          // Uma fruta é consumida de uma vez; uma planta, aos poucos.
          if (item || (plant && plant.biomass <= PLANT_MIN_BIOMASS)) {
            eaten.push(foodId);
            mind.commitment = 0;
          }
          break;
        }

        case 'attack': {
          const targetId = mind.targetEntity;
          if (targetId < 0 || mind.actionCooldown > 0) break;
          const targetTransform = transforms.get(targetId);
          const targetNeeds = needsStore.get(targetId);
          const targetEmotions = emotionsStore.get(targetId);
          const targetMemory = memories.get(targetId);
          const targetBio = bios.get(targetId);
          if (!targetTransform || !targetNeeds || !targetEmotions || !targetMemory || !targetBio)
            break;
          const distance = Math.hypot(
            targetTransform.x - transform.x,
            targetTransform.y - transform.y,
          );
          if (distance > attributes.size + 6) break;

          targetNeeds.health = clamp01(targetNeeds.health - attributes.strength * 0.12);
          targetEmotions.fear = clamp01(targetEmotions.fear + 0.45);
          targetEmotions.stress = clamp01(targetEmotions.stress + 0.3);
          targetEmotions.anger = clamp01(targetEmotions.anger + 0.25);
          emotions.anger = clamp01(emotions.anger - 0.2);

          // A vítima aprende: aquele indivíduo e aquele lugar são perigosos.
          targetMemory.record(subjects.creature(entity), -0.9, 0.6);
          targetMemory.record(subjects.place(targetTransform.x, targetTransform.y), -0.7, 0.4);
          targetEmotions.trauma = clamp01(targetEmotions.trauma + 0.08);
          targetMemory.addEpisode({
            text: `${nameFor(identities, entity)} me atacou`,
            valence: -0.9,
            intensity: 0.85,
            emotion: 'pânico',
            tick: world.tick,
            x: targetTransform.x,
            y: targetTransform.y,
            actor: nameFor(identities, entity),
          });
          memory.record(subjects.creature(targetId), -0.3, 0.2);
          mind.actionCooldown = INTERACT_COOLDOWN;
          mind.commitment = 0;
          break;
        }

        case 'play': {
          const targetId = mind.targetEntity;
          if (targetId < 0 || mind.actionCooldown > 0) break;

          // BRINCAR COM A BOLA.
          //
          // O mesmo "brincar" serve para os dois casos, e o alvo decide qual:
          // uma criatura brinca com outra criatura ou com a bola. Um segundo
          // caso separado no `switch` seria a mesma intenção com dois nomes.
          //
          // O empurrão sai na direção em que ela chegou, não num rumo sorteado:
          // é o corpo dela que joga. E a bola empurrada rola, quica e vai parar
          // longe — é isso que faz a brincadeira continuar sozinha.
          if (world.hasComponent(Ball)) {
            const ball = world.store(Ball).get(targetId);
            const ballItem = items.get(targetId);
            const ballSpot = transforms.get(targetId);
            if (ball && ballItem && ballSpot && !ballItem.held) {
              const reach = Math.hypot(ballSpot.x - transform.x, ballSpot.y - transform.y);
              if (reach > attributes.size + 12) break;
              const away = reach > 0.001 ? 1 / reach : 0;
              const force = 90 + attributes.strength * 60;
              ballItem.vx += (ballSpot.x - transform.x) * away * force;
              ballItem.vy += (ballSpot.y - transform.y) * away * force;
              // O empurrão também LEVANTA a bola. Não é um chute calculado: é
              // um bicho batendo com o corpo numa coisa redonda, e coisa
              // redonda que apanha sobe. Quem é mais forte manda mais longe e
              // mais alto — dá para ver a diferença entre um filhote e um
              // adulto sem nenhum número na tela.
              ball.vz = Math.max(ball.vz, 130 + attributes.strength * 70);
              mind.actionCooldown = 0.9;

              // Brincar é bom, e fica na lembrança: é daqui que sai a criatura
              // que vem correndo quando você larga a bola.
              emotions.happiness = clamp01(emotions.happiness + 0.06);
              emotions.loneliness = clamp01(emotions.loneliness - 0.05);
              needs.energy = clamp01(needs.energy - 0.01);
              memory.record(subjects.player(), 0.12, 0.05);
              if (world.rng.chance(0.06)) {
                memory.addEpisode({
                  text: 'Brinquei com a bola',
                  valence: 0.7,
                  intensity: 0.45,
                  emotion: 'alegria',
                  tick: world.tick,
                  x: transform.x,
                  y: transform.y,
                });
              }
              break;
            }
          }

          const targetTransform = transforms.get(targetId);
          const targetEmotions = emotionsStore.get(targetId);
          const targetMemory = memories.get(targetId);
          if (!targetTransform || !targetEmotions || !targetMemory) break;
          const distance = Math.hypot(
            targetTransform.x - transform.x,
            targetTransform.y - transform.y,
          );
          if (distance > attributes.size + 10) break;

          const traits = traitsStore.get(entity);
          const joy = 0.18 * (0.6 + (traits?.playfulness ?? 0.5));
          emotions.happiness = clamp01(emotions.happiness + joy);
          emotions.loneliness = clamp01(emotions.loneliness - 0.4);
          targetEmotions.happiness = clamp01(targetEmotions.happiness + joy * 0.8);
          targetEmotions.loneliness = clamp01(targetEmotions.loneliness - 0.35);

          // Brincar cria amizade nos dois lados.
          memory.record(subjects.creature(targetId), 0.7, 0.3);
          targetMemory.record(subjects.creature(entity), 0.7, 0.3);
          memory.addEpisode({
            text: `Brinquei com ${nameFor(identities, targetId)}`,
            valence: 0.7,
            intensity: 0.5,
            emotion: 'alegria',
            tick: world.tick,
            x: transform.x,
            y: transform.y,
            actor: nameFor(identities, targetId),
          });
          mind.actionCooldown = INTERACT_COOLDOWN;
          break;
        }

        case 'socialize': {
          const targetId = mind.targetEntity;
          if (targetId < 0) break;
          const targetTransform = transforms.get(targetId);
          if (!targetTransform) break;
          const distance = Math.hypot(
            targetTransform.x - transform.x,
            targetTransform.y - transform.y,
          );
          if (distance > attributes.size + 14) break;
          emotions.loneliness = clamp01(emotions.loneliness - 0.25 * dt);
          memory.record(subjects.creature(targetId), 0.2, 0.05 * dt);
          break;
        }

        case 'share': {
          const targetId = mind.targetEntity;
          if (targetId < 0 || mind.actionCooldown > 0) break;
          const targetNeeds = needsStore.get(targetId);
          const targetTransform = transforms.get(targetId);
          const targetMemory = memories.get(targetId);
          if (!targetNeeds || !targetTransform || !targetMemory) break;
          const distance = Math.hypot(
            targetTransform.x - transform.x,
            targetTransform.y - transform.y,
          );
          if (distance > attributes.size + 10) break;
          if (targetNeeds.hunger < 0.3 || needs.hunger > 0.5) break;

          const given = 0.18;
          needs.hunger = clamp01(needs.hunger + given * 0.6);
          targetNeeds.hunger = clamp01(targetNeeds.hunger - given);
          targetMemory.record(subjects.creature(entity), 0.9, 0.5);
          targetMemory.addEpisode({
            text: `${nameFor(identities, entity)} dividiu comida comigo`,
            valence: 0.9,
            intensity: 0.7,
            emotion: 'gratidão',
            tick: world.tick,
            x: targetTransform.x,
            y: targetTransform.y,
            actor: nameFor(identities, entity),
          });
          memory.record(subjects.creature(targetId), 0.4, 0.2);
          emotions.happiness = clamp01(emotions.happiness + 0.08);
          mind.actionCooldown = INTERACT_COOLDOWN * 2;
          break;
        }

        case 'flee': {
          // Fugir marca o lugar de onde se fugiu como desagradável.
          memory.record(subjects.place(transform.x, transform.y), -0.25, 0.05 * dt);
          break;
        }

        default:
          break;
      }

      // Filhotes ficam perto: sofrem mais solidão longe dos adultos.
      const bio = bios.get(entity);
      if (bio && isBaby(bio)) {
        emotions.fear = clamp01(emotions.fear + 0.01 * dt);
      }
    });

    for (let i = 0; i < eaten.length; i++) world.destroyEntity(eaten[i]!);
  },
};

const nameOf = (variant: number): string => RESOURCE_NAMES[variant] ?? 'algo';

function nameFor(
  identities: { get(id: number): { name: string } | undefined },
  id: number,
): string {
  return identities.get(id)?.name ?? 'alguém';
}
