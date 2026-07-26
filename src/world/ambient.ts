import { TAU, clamp, createRng } from '@core';
import { defineResource, type System } from '@engine';
import { SceneryResource } from './scenery';
import { WeatherResource } from './weather';

export const AMBIENT_BUTTERFLY = 0;
export const AMBIENT_BEE = 1;
export const AMBIENT_BIRD = 2;
export const AMBIENT_CRITTER = 3;

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

const COUNTS = [14, 8, 5, 4]; // borboletas, abelhas, pássaros, bichinhos
const SPEEDS = [16, 26, 34, 30];

export function createAmbient(width: number, height: number, seed: number): AmbientBeing[] {
  const rng = createRng(seed ^ 0xa11b1e);
  const beings: AmbientBeing[] = [];
  for (let kind = 0; kind < COUNTS.length; kind++) {
    for (let i = 0; i < COUNTS[kind]!; i++) {
      const x = rng.range(0, width);
      const y = rng.range(0, height);
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

    for (const being of beings) {
      being.phase += dt * (being.kind === AMBIENT_BIRD ? 8 : 14);

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
          being.kind === AMBIENT_CRITTER ? 0 : rng.range(1.5, being.kind === AMBIENT_BIRD ? 7 : 4);
        pickTarget(being, scenery, rng, config.width, config.height, raining);
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
): void {
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
