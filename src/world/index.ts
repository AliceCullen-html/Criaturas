// Mundo: terreno, recursos, plantas e seus processos (crescimento/disseminação).

export * from './components';
export { RESOURCE_NAMES } from './resourceNames';
export {
  Item,
  registerItems,
  spawnFruit,
  spawnToy,
  dropFruitNear,
  itemRadius,
  MAX_ITEMS,
  TOXIC_FRUIT_VARIANT,
} from './items';
export { SceneryResource, generateScenery } from './scenery';
export type { SceneryPiece, SceneryKind } from './scenery';
export { itemSystem } from './systems/itemSystem';
export { WeatherResource, createWeather, weatherSystem } from './weather';
export type { Weather, WeatherKind } from './weather';
export {
  AmbientResource,
  createAmbient,
  ambientSystem,
  AMBIENT_BUTTERFLY,
  AMBIENT_BEE,
  AMBIENT_BIRD,
  AMBIENT_CRITTER,
} from './ambient';
export type { AmbientBeing } from './ambient';
export { generateTerrain, isWaterAt, findNearestWater, GROUND, WATER } from './terrain';
export type { Terrain } from './terrain';
export { TerrainResource } from './terrainResource';
export { spawnPlant, radiusForBiomass, MAX_PLANTS, RESOURCE_VARIANTS } from './plant';
export { plantGrowthSystem } from './systems/plantGrowthSystem';
export { plantSpreadSystem } from './systems/plantSpreadSystem';
export { createWorld } from './createWorld';
