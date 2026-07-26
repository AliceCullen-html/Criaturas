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
export { handReactionSystem } from './systems/handReactionSystem';
export { searchSystem, DiscoveryResource } from './systems/searchSystem';
export { idleSystem } from './systems/idleSystem';
export {
  grabItem,
  moveHeldItem,
  releaseItem,
  petCreature,
  rememberPetting,
  roughGesture,
  callAttention,
  observeCreature,
  offerItem,
  setCreatureName,
  setHandPresence,
} from './handActions';
export type { DropResult } from './handActions';
export { writeItemBuffer } from './itemRender';
export {
  shakeTree,
  turnRock,
  pokeProps,
  touchWater,
  rememberPleasantPlace,
  attractBirds,
} from './worldActions';
export type { PokeResult } from './worldActions';
export { isBaby, isElder, lifeStage, growthScale } from './age';
