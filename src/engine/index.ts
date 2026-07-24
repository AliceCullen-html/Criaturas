// Núcleo ECS + loop de simulação com timestep fixo.

export type { Entity } from './entity';
export { EntityManager } from './entity';
export { ComponentStore } from './componentStore';
export { defineComponent } from './component';
export type { ComponentType } from './component';
export { defineResource } from './resource';
export type { ResourceKey } from './resource';
export { World } from './world';
export type { WorldConfig } from './world';
export { Transform, Sprite, Velocity } from './components';
export { CreatureRenderBuffer } from './creatureRenderBuffer';
export type { System } from './system';
export { SystemScheduler } from './system';
export { SimulationLoop } from './loop';
export type { LoopCallbacks, LoopControls } from './loop';
export { RenderBuffer } from './renderBuffer';
export { writeRenderBuffer } from './writeRenderBuffer';
export type { TileGrid } from './tileGrid';
