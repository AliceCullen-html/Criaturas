import { clamp01 } from '@core';
import { defineResource, type System } from '@engine';
import { spawnFruit, Item, MAX_ITEMS, TOXIC_FRUIT_VARIANT } from './items';
import { SceneryResource } from './scenery';

export type WeatherKind = 'clear' | 'rain';

export interface Weather {
  kind: WeatherKind;
  /** 0..1 — sobe e desce suavemente, para a chuva começar e passar. */
  intensity: number;
  timer: number;
  /** Poças que aparecem depois da chuva e secam devagar. */
  puddles: Array<{ x: number; y: number; life: number }>;
  /** 0..1 — arco-íris, a recompensa rara de quem estava olhando na hora certa. */
  rainbow: number;
}

export const WeatherResource = defineResource<Weather>('Weather');

export function createWeather(): Weather {
  return { kind: 'clear', intensity: 0, timer: 120, puddles: [], rainbow: 0 };
}

const CLEAR_MIN = 150;
const CLEAR_MAX = 420;
const RAIN_MIN = 60;
const RAIN_MAX = 140;
const FADE_RATE = 0.25;
const PUDDLE_DRY_RATE = 0.012;
const MUSHROOMS_AFTER_RAIN = 5;

/**
 * O tempo muda sozinho, e deixa marcas: depois da chuva nascem cogumelos e
 * ficam poças no chão. É o mundo acontecendo sem o jogador.
 */
export const weatherSystem: System = {
  name: 'weather',
  update(world, dt) {
    const weather = world.getResource(WeatherResource);
    const { rng } = world;

    weather.timer -= dt;

    if (weather.timer <= 0) {
      if (weather.kind === 'clear') {
        weather.kind = 'rain';
        weather.timer = rng.range(RAIN_MIN, RAIN_MAX);
      } else {
        weather.kind = 'clear';
        weather.timer = rng.range(CLEAR_MIN, CLEAR_MAX);
        afterRain(world, weather);
        // Nem toda chuva deixa arco-íris — é isso que o torna especial.
        if (rng.chance(0.6)) weather.rainbow = 1;
      }
    }

    // A intensidade persegue o alvo: chuva entra e sai suavemente.
    const target = weather.kind === 'rain' ? 1 : 0;
    weather.intensity = clamp01(
      weather.intensity + Math.sign(target - weather.intensity) * FADE_RATE * dt,
    );

    // O arco-íris some devagar.
    if (weather.rainbow > 0) weather.rainbow = Math.max(0, weather.rainbow - 0.02 * dt);

    // Poças secam.
    for (let i = weather.puddles.length - 1; i >= 0; i--) {
      const puddle = weather.puddles[i]!;
      puddle.life -= PUDDLE_DRY_RATE * dt;
      if (puddle.life <= 0) weather.puddles.splice(i, 1);
    }
  },
};

/** Depois da chuva: cogumelos brotam e ficam poças. */
function afterRain(world: Parameters<typeof weatherSystem.update>[0], weather: Weather): void {
  const { rng } = world;
  const scenery = world.getResource(SceneryResource);
  const items = world.store(Item);

  for (let i = 0; i < MUSHROOMS_AFTER_RAIN && items.size < MAX_ITEMS; i++) {
    // Cogumelos gostam da sombra das árvores.
    const spot = scenery.length > 0 ? rng.pick(scenery) : null;
    const x = spot ? spot.x + rng.range(-30, 30) : rng.range(20, world.config.width - 20);
    const y = spot ? spot.y + rng.range(6, 34) : rng.range(20, world.config.height - 20);
    spawnFruit(
      world,
      Math.max(4, Math.min(world.config.width - 4, x)),
      Math.max(4, Math.min(world.config.height - 4, y)),
      {
        toxic: true,
        variant: TOXIC_FRUIT_VARIANT,
      },
    );
  }

  for (let i = 0; i < 10; i++) {
    weather.puddles.push({
      x: rng.range(20, world.config.width - 20),
      y: rng.range(20, world.config.height - 20),
      life: 1,
    });
  }
}
