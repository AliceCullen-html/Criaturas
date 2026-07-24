// Sistemas (use cases) que aplicam as regras a cada tick + projeções e comandos.

export { movementSystem } from './systems/movementSystem';
export { instinctSystem } from './systems/instinctSystem';
export { eatingSystem } from './systems/eatingSystem';
export { metabolismSystem } from './systems/metabolismSystem';
export { foodIndexSystem, FoodIndexResource } from './foodIndex';
export { spawnCreatures } from './spawnCreatures';
export { writeCreatureBuffer } from './creatureRender';
export { readCreatureSnapshot } from './creatureSnapshot';
export type { CreatureSnapshot } from './creatureSnapshot';
export { feedCreature, setCreatureName } from './commands';
