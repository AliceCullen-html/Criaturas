import type { World } from '@engine';
import { registerCreatureComponents, spawnCreature } from '@creatures';
import { TerrainResource, isWaterAt } from '@world';

/** Registra os componentes de criatura e povoa o mundo com `count` criaturas em solo. */
export function spawnCreatures(world: World, count: number): void {
  registerCreatureComponents(world);
  const terrain = world.getResource(TerrainResource);

  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 40;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const x = world.rng.range(0, world.config.width);
    const y = world.rng.range(0, world.config.height);
    if (isWaterAt(terrain, x, y)) continue;
    spawnCreature(world, x, y);
    placed++;
  }
}
