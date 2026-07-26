import type { World } from '@engine';
import { registerCreatureComponents, spawnCreature } from '@creatures';
import { BOULDER_RADIUS, Item, TerrainResource, makeMainlandTest, type Blocker } from '@world';
import { Transform } from '@engine';
import { solids } from './solids';

/** Registra os componentes de criatura e povoa o mundo com `count` criaturas em solo. */
export function spawnCreatures(world: World, count: number): void {
  registerCreatureComponents(world);
  const terrain = world.getResource(TerrainResource);
  // Nem na água, nem debaixo de uma pedra grande.
  solids.rebuild(world);

  // E nem num pedaço de terra isolado pelo lago. Um punhado de criaturas do
  // outro lado da água não alcança comida nem companhia: morrem lá, e o jardim
  // parece estar se extinguindo sem motivo aparente.
  const blockers: Blocker[] = [];
  const transforms = world.store(Transform);
  world.store(Item).forEach((item, entity) => {
    if (item.kind !== 'boulder') return;
    const transform = transforms.get(entity);
    if (transform) blockers.push({ x: transform.x, y: transform.y, radius: BOULDER_RADIUS + 4 });
  });
  const onMainland = makeMainlandTest(terrain, blockers, world.config.width, world.config.height);

  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 40;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const x = world.rng.range(0, world.config.width);
    const y = world.rng.range(0, world.config.height);
    if (solids.blocked(terrain, x, y) || !onMainland(x, y)) continue;
    spawnCreature(world, x, y);
    placed++;
  }
}
