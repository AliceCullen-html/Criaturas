// Mundo: terreno, recursos, plantas e seus processos (crescimento/disseminação).

export * from './components';
export { generateTerrain, isWaterAt, findNearestWater, GROUND, WATER } from './terrain';
export type { Terrain } from './terrain';
export { TerrainResource } from './terrainResource';
export { spawnPlant, radiusForBiomass, MAX_PLANTS, RESOURCE_VARIANTS } from './plant';
export { plantGrowthSystem } from './systems/plantGrowthSystem';
export { plantSpreadSystem } from './systems/plantSpreadSystem';
export { createWorld } from './createWorld';
