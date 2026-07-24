// Sistemas (use cases) que aplicam as regras a cada tick + projeções e comandos.

export { movementSystem } from './systems/movementSystem';
export { emotionSystem } from './systems/emotionSystem';
export { decisionSystem } from './systems/decisionSystem';
export { actionSystem } from './systems/actionSystem';
export { metabolismSystem } from './systems/metabolismSystem';
export { reproductionSystem } from './systems/reproductionSystem';
export { foodIndexSystem, FoodIndexResource } from './foodIndex';
export { creatureIndexSystem, CreatureIndexResource } from './creatureIndex';
export { BrainResource } from './brainResource';
export { PlayerResource } from './player';
export type { PlayerPresence } from './player';
export { spawnCreatures } from './spawnCreatures';
export { writeCreatureBuffer } from './creatureRender';
export { readCreatureSnapshot } from './creatureSnapshot';
export type { CreatureSnapshot } from './creatureSnapshot';
export { applyPlayerAction, setCreatureName } from './playerActions';
export type { PlayerAction } from './playerActions';
export { isBaby, growthScale } from './age';
