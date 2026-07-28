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
  maxItems,
  loose,
  MAX_STACK,
  STACK_STEP,
  TOXIC_FRUIT_VARIANT,
  VARIANT,
  isRare,
  spawnTrinket,
  spawnBall,
  spawnGift,
  GIFTS,
  spawnBoulder,
  BOULDER_RADIUS,
} from './items';
export type { ItemKind } from './items';
export { Ball, ballSystem, ballVariant, kickBall } from './ball';
export {
  SceneryResource,
  generateScenery,
  tileOnLand,
  pieceAtTile,
  tileAt,
  placeOnTile,
  makePiece,
  placeComputer,
} from './scenery';
export type { SceneryPiece, SceneryKind } from './scenery';
export { itemSystem } from './systems/itemSystem';
export { sceneryGrowthSystem } from './systems/sceneryGrowthSystem';
export { PROP, PropsResource, generateProps, propSystem, isTallProp, swayPropsNear } from './props';
export type { Prop, PropKind } from './props';
export { WeatherResource, createWeather, weatherSystem } from './weather';
export { DayNightResource, createDayNight, dayNightSystem, isNight } from './dayNight';
export type { DayNight } from './dayNight';
export type { Weather, WeatherKind } from './weather';
export {
  AmbientResource,
  createAmbient,
  ambientSystem,
  AMBIENT_BUTTERFLY,
  AMBIENT_BEE,
  AMBIENT_BIRD,
  AMBIENT_CRITTER,
  AMBIENT_FISH,
  AMBIENT_DRAGONFLY,
  AMBIENT_FROG,
  AMBIENT_FIREFLY,
} from './ambient';
export type { AmbientBeing } from './ambient';
export { generateTerrain, isWaterAt, findNearestWater, GROUND, WATER } from './terrain';
export type { Terrain } from './terrain';
export { TerrainResource } from './terrainResource';
export { spawnPlant, radiusForBiomass, maxPlants, RESOURCE_VARIANTS } from './plant';
export { areaScale, countFor, countIn } from './density';
export { largestOpenRegion, makeMainlandTest } from './connectivity';
export type { Blocker } from './connectivity';
export { plantGrowthSystem } from './systems/plantGrowthSystem';
export { plantSpreadSystem } from './systems/plantSpreadSystem';
export { createWorld } from './createWorld';
