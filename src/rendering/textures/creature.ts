import type { Texture } from 'pixi.js';
import {
  decodeFeatures,
  makeBodyTexture,
  type BodyColors,
  type Features,
  type LifeStage,
} from './body';
import { makeFaceTexture, type Expression } from './face';

export { SPRITE_SIZE } from './body';
export type { LifeStage } from './body';
export type { Expression } from './face';
export { SPECIES_SHAPES, shapeAt } from './speciesShapes';

/**
 * Cache de texturas geradas sob demanda.
 *
 * Corpos são únicos por (DNA, cores, fase, espécie); rostos são compartilhados
 * por (expressão, cor do olho, fase, espécie, traços do rosto) — muitas
 * criaturas dividem o mesmo rosto, então geramos poucas texturas mesmo com
 * dezenas de bichos na tela.
 */
const bodyCache = new Map<string, Texture>();
const faceCache = new Map<string, Texture>();

export function getBodyTexture(
  dna: number,
  colors: BodyColors,
  stage: LifeStage,
  speciesIndex: number,
): Texture {
  const key = `${dna}|${colors.body}|${colors.accent}|${stage}|${speciesIndex}`;
  let texture = bodyCache.get(key);
  if (!texture) {
    texture = makeBodyTexture(dna, colors, stage, speciesIndex);
    bodyCache.set(key, texture);
  }
  return texture;
}

export function getFaceTexture(
  expression: Expression,
  eyeColor: number,
  stage: LifeStage,
  features: Features,
  speciesIndex: number,
): Texture {
  const faceBits = `${features.cheeks ? 1 : 0}${features.whiskers ? 1 : 0}${features.freckles ? 1 : 0}`;
  const key = `${expression}|${eyeColor}|${stage}|${speciesIndex}|${faceBits}`;
  let texture = faceCache.get(key);
  if (!texture) {
    texture = makeFaceTexture(expression, eyeColor, stage, features, speciesIndex);
    faceCache.set(key, texture);
  }
  return texture;
}

export { decodeFeatures };
export type { Features, BodyColors };

/** Libera todas as texturas geradas (usado ao destruir o renderer). */
export function clearCreatureTextureCache(): void {
  for (const texture of bodyCache.values()) texture.destroy(true);
  for (const texture of faceCache.values()) texture.destroy(true);
  bodyCache.clear();
  faceCache.clear();
}
