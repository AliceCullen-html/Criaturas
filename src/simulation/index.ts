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
export { carrySystem } from './systems/carrySystem';
export { fearLearningSystem } from './systems/fearLearningSystem';
export { observationSystem } from './systems/observationSystem';
export { searchSystem, DiscoveryResource } from './systems/searchSystem';
export { rewardSystem } from './systems/rewardSystem';
export { idleSystem } from './systems/idleSystem';
export { confinementSystem } from './systems/confinementSystem';
export { planSystem, Plan } from './systems/planSystem';
export { socialSystem, DeathsResource } from './systems/socialSystem';
export { Order, ORDER, orderSystem, issueOrder, clearOrder } from './orders';
export {
  eggSystem,
  warmEgg,
  hatchNow,
  isEgg,
  hatchProgress,
  forEachEgg,
} from './systems/eggSystem';
export {
  shakeFruitFrom,
  feedCreature,
  placeBall,
  placeGift,
  placeEgg,
  scrub,
  nameThing,
  wordForSpot,
} from './toolActions';
export type { BallReply, EggReply, FeedReply, ScrubReply } from './toolActions';
export {
  Chatter,
  SpeechResource,
  teachingSystem,
  teachWord,
  showAndTell,
  findComputer,
} from './systems/teachingSystem';
export type { Utterance, LessonReply } from './systems/teachingSystem';
export { SpeciesResource, Budding, PHASE, buddingSystem, isBuddingPhase } from './species';
export type { SpeciesState } from './species';
export { WatchedResource, createWatched } from './watched';
export type { Watched } from './watched';
export { ChronicleResource, createChronicle, chronicle, recentEntries } from './chronicle';
export type { Chronicle, ChronicleEntry } from './chronicle';
export type { OrderKind, OrderReply } from './orders';
export { ROUTINE, ROUTINE_NAMES, carriedBy, dropCarried } from './routines';
export { solids } from './solids';
export {
  grabItem,
  moveHeldItem,
  releaseItem,
  petCreature,
  rememberPetting,
  roughGesture,
  liftCreature,
  moveCarried,
  dropCreature,
  CARRY_PATIENCE,
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
export { dropScenery, plantSeed, removeScenery } from './sceneryActions';
export type { SceneryDrop, SceneryDropKind } from './sceneryActions';
export { isBaby, isElder, lifeStage, growthScale } from './age';
