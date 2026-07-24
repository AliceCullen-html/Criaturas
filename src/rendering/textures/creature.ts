import type { Texture } from 'pixi.js';
import { decodeFeatures, makeBodyTexture, type Features, type LifeStage } from './body';
import { makeFaceTexture, type Expression } from './face';

export { SPRITE_SIZE } from './body';
export type { LifeStage } from './body';
export type { Expression } from './face';

/**
 * Cache de texturas geradas sob demanda.
 *
 * Corpos são únicos por (DNA, cor, fase); rostos são compartilhados por
 * (cor do olho, fase, traços do rosto, expressão) — muitas criaturas dividem
 * o mesmo rosto, então geramos poucas texturas mesmo com centenas de bichos.
 */
const bodyCache = new Map<string, Texture>();
const faceCache = new Map<string, Texture>();

export function getBodyTexture(dna: number, bodyColor: number, stage: LifeStage): Texture {
  const key = `${dna}|${bodyColor}|${stage}`;
  let texture = bodyCache.get(key);
  if (!texture) {
    texture = makeBodyTexture(dna, bodyColor, stage);
    bodyCache.set(key, texture);
  }
  return texture;
}

export function getFaceTexture(
  expression: Expression,
  eyeColor: number,
  stage: LifeStage,
  features: Features,
): Texture {
  const faceBits = `${features.cheeks ? 1 : 0}${features.whiskers ? 1 : 0}${features.freckles ? 1 : 0}`;
  const key = `${expression}|${eyeColor}|${stage}|${faceBits}`;
  let texture = faceCache.get(key);
  if (!texture) {
    texture = makeFaceTexture(expression, eyeColor, stage, features);
    faceCache.set(key, texture);
  }
  return texture;
}

export { decodeFeatures };
export type { Features };

/** Libera todas as texturas geradas (usado ao destruir o renderer). */
export function clearCreatureTextureCache(): void {
  for (const texture of bodyCache.values()) texture.destroy(true);
  for (const texture of faceCache.values()) texture.destroy(true);
  bodyCache.clear();
  faceCache.clear();
}
