import { POSE, clamp01 } from '@core';
import { Transform, Velocity, type System } from '@engine';
import { Behavior, Bio, Creature, Emotions, Mind, Needs } from '@creatures';
import { TerrainResource, WeatherResource, findNearestWater } from '@world';
import { DeathsResource } from './socialSystem';
import { growthScale } from '../age';

const HUNGER_RATE = 0.011;
const THIRST_RATE = 0.015;
const DRINK_RATE = 0.3;
const MOVE_DRAIN = 0.012;
const REST_RECOVER = 0.03;
/** Quanto um corpo se suja por segundo: do limpo ao encardido em ~15 minutos. */
const DIRT_RATE = 0.0011;
/** E o quanto sai quando ela se cata, ou quando chove em cima dela. */
const GROOM_WASH = 0.035;
const RAIN_WASH = 0.02;
const SLEEP_RECOVER = 0.09;
const HEALTH_DRAIN = 0.05;
const HEALTH_REGEN = 0.02;
const DRINK_REACH = 24;

const deaths: number[] = [];

/**
 * Passagem do tempo no corpo: fome/sede sobem conforme o metabolismo (genético),
 * energia gasta ao mover e recupera dormindo, envelhecimento e morte.
 */
export const metabolismSystem: System = {
  name: 'metabolism',
  update(world, dt) {
    const creatures = world.store(Creature);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const bioStore = world.store(Bio);
    const minds = world.store(Mind);
    const transforms = world.store(Transform);
    const velocities = world.store(Velocity);
    const terrain = world.getResource(TerrainResource);
    const behaviors = world.store(Behavior);
    const rain = world.hasResource(WeatherResource)
      ? world.getResource(WeatherResource).intensity
      : 0;

    deaths.length = 0;

    creatures.forEach((_tag, entity) => {
      const needs = needsStore.get(entity);
      const bio = bioStore.get(entity);
      const emotions = emotionsStore.get(entity);
      const mind = minds.get(entity);
      if (!needs || !bio || !emotions || !mind) return;

      // Corpo pequeno gasta menos. Sem isto o filhote consome como um adulto
      // feito, e como ele ainda não sabe onde ficam a comida e a água, morria
      // de fome antes de crescer — nenhuma geração chegava à idade adulta.
      const body = growthScale(bio);
      needs.hunger = clamp01(needs.hunger + HUNGER_RATE * bio.metabolism * body * dt);
      needs.thirst = clamp01(needs.thirst + THIRST_RATE * bio.metabolism * body * dt);

      const transform = transforms.get(entity);
      if (transform && findNearestWater(terrain, transform.x, transform.y, DRINK_REACH)) {
        needs.thirst = clamp01(needs.thirst - DRINK_RATE * dt);
      }

      const velocity = velocities.get(entity);
      const moving = velocity ? velocity.x !== 0 || velocity.y !== 0 : false;
      const sleeping = mind.intent === 'sleep';
      const energyDelta = sleeping ? SLEEP_RECOVER : moving ? -MOVE_DRAIN : REST_RECOVER;
      needs.energy = clamp01(needs.energy + energyDelta * dt);

      // A SUJEIRA, E COMO ELA SAI SOZINHA.
      //
      // Sobe devagar — um dia inteiro de jardim encarde um bicho — e pesa de
      // leve no humor. Mas o bicho se limpa: quando ela se cata (o gesto que já
      // existia), a sujeira cai; na chuva, cai mais rápido ainda.
      //
      // Isso não é conforto: é obrigação do projeto. Sem uma saída natural, o
      // jardim inteiro ficava encardido e infeliz para sempre a menos que o
      // jogador passasse a esponja em cada um — e o mundo tem de continuar
      // vivo sozinho, com ou sem alguém olhando. Medido: com a sujeira sem
      // saída, dois testes de comportamento longo mudaram de resultado.
      const grooming = behaviors.get(entity)?.pose === POSE.groom;
      const washing = rain > 0.3 ? rain * RAIN_WASH : 0;
      needs.dirt = clamp01(
        needs.dirt + DIRT_RATE * dt - (grooming ? GROOM_WASH : 0) * dt - washing * dt,
      );
      if (needs.dirt > 0.75) emotions.happiness = clamp01(emotions.happiness - 0.002 * dt);

      bio.age += dt;
      bio.matingCooldown = Math.max(0, bio.matingCooldown - dt);

      if (needs.hunger >= 1 || needs.thirst >= 1) {
        needs.health = clamp01(needs.health - HEALTH_DRAIN * dt);
        emotions.stress = clamp01(emotions.stress + 0.05 * dt);
      } else if (needs.hunger < 0.7 && needs.thirst < 0.7 && needs.energy > 0.2) {
        needs.health = clamp01(needs.health + HEALTH_REGEN * dt);
      }

      if (needs.health <= 0 || bio.age >= bio.lifespan) deaths.push(entity);
    });

    // Anuncia as mortes antes de apagar as entidades: quem fica precisa saber
    // de quem se despedir, e depois da destruição não sobra nome nem lugar.
    if (deaths.length > 0 && world.hasResource(DeathsResource)) {
      world.getResource(DeathsResource).push(...deaths);
    }
    for (let i = 0; i < deaths.length; i++) world.destroyEntity(deaths[i]!);
  },
};
