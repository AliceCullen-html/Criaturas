import { TAU, clamp, createRng } from '@core';
import { defineResource, type System } from '@engine';
import { SceneryResource } from './scenery';
import { TerrainResource } from './terrainResource';
import { isWaterAt } from './terrain';
import { WeatherResource } from './weather';
import { DayNightResource } from './dayNight';
import { countFor } from './density';

export const AMBIENT_BUTTERFLY = 0;
export const AMBIENT_BEE = 1;
export const AMBIENT_BIRD = 2;
export const AMBIENT_CRITTER = 3;
export const AMBIENT_FISH = 4;
export const AMBIENT_DRAGONFLY = 5;
export const AMBIENT_FROG = 6;
export const AMBIENT_FIREFLY = 7;

export interface AmbientBeing {
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Fase da batida de asas / do saltinho. */
  phase: number;
  /** Tempo parado (pousado numa flor, num galho). */
  resting: number;
  targetX: number;
  targetY: number;
}

/**
 * Bichinhos de ambiente. Não são entidades ECS de propósito: não têm genética,
 * memória nem emoções, e entrariam à toa nos índices espaciais de comida e
 * criaturas. Um array simples é mais leve — e as criaturas ainda os percebem,
 * porque o sistema de decisão lê este recurso direto.
 */
export const AmbientResource = defineResource<AmbientBeing[]>('Ambient');

// borboletas, abelhas, pássaros, bichinhos, peixes, libélulas, rãs, vaga-lumes
/** Quantos de cada tipo num mundo 1000×1000. */
const COUNTS_BASE = [14, 8, 5, 4, 10, 6, 5, 22];
const SPEEDS = [16, 26, 34, 30, 22, 40, 20, 14];

export function createAmbient(
  width: number,
  height: number,
  seed: number,
  isWater?: (x: number, y: number) => boolean,
): AmbientBeing[] {
  const rng = createRng(seed ^ 0xa11b1e);
  const beings: AmbientBeing[] = [];
  for (let kind = 0; kind < COUNTS_BASE.length; kind++) {
    const howMany = countFor(COUNTS_BASE[kind]!, width, height, 2);
    for (let i = 0; i < howMany; i++) {
      let x = rng.range(0, width);
      let y = rng.range(0, height);
      // Peixes e libélulas pertencem à água: procuram o lago para nascer.
      if ((kind === AMBIENT_FISH || kind === AMBIENT_DRAGONFLY) && isWater) {
        for (let tries = 0; tries < 200 && !isWater(x, y); tries++) {
          x = rng.range(0, width);
          y = rng.range(0, height);
        }
      }
      // Rãs nascem na beira: em terra, mas coladas na água.
      if (kind === AMBIENT_FROG && isWater) {
        for (let tries = 0; tries < 300; tries++) {
          if (!isWater(x, y) && (isWater(x + 20, y) || isWater(x - 20, y) || isWater(x, y + 20))) {
            break;
          }
          x = rng.range(0, width);
          y = rng.range(0, height);
        }
      }
      beings.push({
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        phase: rng.range(0, TAU),
        resting: 0,
        targetX: x,
        targetY: y,
      });
    }
  }
  return beings;
}

const REACH = 8;

/** Borboletas pousam em flores, abelhas as visitam, pássaros pousam em árvores. */
export const ambientSystem: System = {
  name: 'ambient',
  update(world, dt) {
    const beings = world.getResource(AmbientResource);
    const scenery = world.getResource(SceneryResource);
    const weather = world.getResource(WeatherResource);
    const { rng, config } = world;

    // Na chuva, os insetos se recolhem: quase todos somem de cena.
    const raining = weather.intensity > 0.4;

    const terrain = world.getResource(TerrainResource);
    const cycle = world.getResource(DayNightResource);
    const night = cycle.darkness > 0.5;
    const inWater = (x: number, y: number): boolean => isWaterAt(terrain, x, y);

    for (const being of beings) {
      // Vaga-lumes só existem de noite; borboletas e abelhas, só de dia.
      if (being.kind === AMBIENT_FIREFLY && !night) continue;
      being.phase += dt * (being.kind === AMBIENT_BIRD ? 8 : being.kind === AMBIENT_FISH ? 5 : 14);

      if (being.resting > 0) {
        being.resting -= dt;
        continue;
      }

      const dx = being.targetX - being.x;
      const dy = being.targetY - being.y;
      const distance = Math.hypot(dx, dy);

      if (distance < REACH) {
        // Chegou: descansa um pouco (pousa) e escolhe outro destino.
        being.resting =
          being.kind === AMBIENT_CRITTER || being.kind === AMBIENT_FISH
            ? 0
            : being.kind === AMBIENT_FROG
              ? rng.range(2, 6)
              : rng.range(1.5, being.kind === AMBIENT_BIRD ? 7 : 4);
        pickTarget(being, scenery, rng, config.width, config.height, raining, inWater);
        continue;
      }

      const speed = SPEEDS[being.kind]! * (raining ? 1.6 : 1);
      being.vx = (dx / distance) * speed;
      being.vy = (dy / distance) * speed;

      // Borboletas e abelhas voam em zigue-zague, nunca em linha reta.
      const flutter = being.kind === AMBIENT_BUTTERFLY ? 26 : being.kind === AMBIENT_BEE ? 14 : 0;
      being.x = clamp(being.x + (being.vx + Math.cos(being.phase) * flutter) * dt, 0, config.width);
      being.y = clamp(
        being.y + (being.vy + Math.sin(being.phase * 1.3) * flutter) * dt,
        0,
        config.height,
      );
    }
  },
};

function pickTarget(
  being: AmbientBeing,
  scenery: ReadonlyArray<{ kind: string; x: number; y: number }>,
  rng: {
    range(min: number, max: number): number;
    chance(p: number): boolean;
    pick<T>(a: readonly T[]): T;
  },
  width: number,
  height: number,
  raining: boolean,
  inWater?: (x: number, y: number) => boolean,
): void {
  // Rãs ficam na beira: pulam curto e nunca entram no lago.
  if (being.kind === AMBIENT_FROG && inWater) {
    for (let i = 0; i < 16; i++) {
      const tx = clamp(being.x + rng.range(-40, 40), 4, width - 4);
      const ty = clamp(being.y + rng.range(-40, 40), 4, height - 4);
      if (!inWater(tx, ty)) {
        being.targetX = tx;
        being.targetY = ty;
        return;
      }
    }
    return;
  }

  // Peixes e libélulas não saem do lago: sorteiam destinos até cair na água.
  if ((being.kind === AMBIENT_FISH || being.kind === AMBIENT_DRAGONFLY) && inWater) {
    for (let i = 0; i < 24; i++) {
      const tx = clamp(being.x + rng.range(-90, 90), 4, width - 4);
      const ty = clamp(being.y + rng.range(-90, 90), 4, height - 4);
      if (inWater(tx, ty)) {
        being.targetX = tx;
        being.targetY = ty;
        return;
      }
    }
    return;
  }
  // Pássaros preferem árvores; os outros vagam pelo campo.
  if (being.kind === AMBIENT_BIRD && scenery.length > 0 && !raining && rng.chance(0.7)) {
    const trees = scenery.filter((piece) => piece.kind === 'tree');
    if (trees.length > 0) {
      const tree = rng.pick(trees);
      being.targetX = tree.x + rng.range(-6, 6);
      being.targetY = tree.y - rng.range(10, 22);
      return;
    }
  }
  being.targetX = clamp(being.x + rng.range(-160, 160), 4, width - 4);
  being.targetY = clamp(being.y + rng.range(-160, 160), 4, height - 4);
}
