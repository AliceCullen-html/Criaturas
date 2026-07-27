import { Sprite, Transform, World, type WorldConfig } from '@engine';
import { createRng } from '@core';
import { Plant } from './components';
import { generateTerrain, isWaterAt, findNearestWater } from './terrain';
import { TerrainResource } from './terrainResource';
import { spawnPlant } from './plant';
import { registerItems, spawnFruit, spawnTrinket, spawnBoulder, BOULDER_RADIUS } from './items';
import { SceneryResource, generateScenery, placeComputer } from './scenery';
import { WeatherResource, createWeather } from './weather';
import { DayNightResource, createDayNight } from './dayNight';
import { AmbientResource, createAmbient } from './ambient';
import { PropsResource, generateProps } from './props';
import { largestOpenRegion, type Blocker } from './connectivity';
import { countFor } from './density';

/**
 * Célula do terreno.
 *
 * Era 25px, e é de onde vinha a escadaria grosseira na beira dos lagos: cada
 * degrau tinha 25 pixels de altura e a margem parecia recortada com tesoura.
 * A 10px a curva do lago fica lisa. Custa mais sprites de água, mas são
 * algumas centenas — irrisório perto de deixar o jardim bonito.
 */
const TERRAIN_CELL_SIZE = 10;
/** Plantas e bugigangas iniciais num mundo 1000×1000. */
const INITIAL_PLANTS_BASE = 55;
const INITIAL_TRINKETS_BASE = 26;
/** Pedras grandes espalhadas pelo jardim, num mundo 1000×1000. */
const BOULDERS_BASE = 8;
/** Folga mínima entre uma pedra e a água — o primeiro filtro, barato. */
const WATER_CLEARANCE = 55;
/** O quanto uma pedra bloqueia, igual ao que o movimento usa. */
const BOULDER_BLOCK = BOULDER_RADIUS + 4;
/** Quantas células de 20px uma pedra legitimamente ocupa, com folga. */
const BOULDER_FOOTPRINT_CELLS = 6;

/**
 * Monta um mundo da Etapa 2: terreno com lagos + uma população inicial de
 * plantas semeada em solo. Tudo derivado da seed → reprodutível.
 */
export function createWorld(config: WorldConfig, seed: number): World {
  const world = new World(config, createRng(seed));
  world.register(Transform);
  world.register(Sprite);
  world.register(Plant);

  registerItems(world);

  const terrain = generateTerrain(config.width, config.height, TERRAIN_CELL_SIZE, world.rng);
  world.setResource(TerrainResource, terrain);

  const scenery = generateScenery(terrain, config.width, config.height, seed);
  // A máquina de ensinar palavras já vem com o jardim. Ela é do jogador, não da
  // natureza: é a única coisa ali que ninguém plantou.
  placeComputer(scenery, terrain, config.width, config.height);
  world.setResource(SceneryResource, scenery);
  world.setResource(WeatherResource, createWeather());
  world.setResource(DayNightResource, createDayNight());
  world.setResource(
    AmbientResource,
    createAmbient(config.width, config.height, seed, (x, y) => isWaterAt(terrain, x, y)),
  );
  world.setResource(
    PropsResource,
    generateProps(terrain, scenery, config.width, config.height, seed),
  );

  // Objetos soltos: o jardim já começa com coisas para mexer.
  const trinkets = ['stick', 'seed', 'feather', 'stone', 'shell'] as const;
  const trinketCount = countFor(INITIAL_TRINKETS_BASE, config.width, config.height, 8);
  for (let i = 0; i < trinketCount; i++) {
    const x = world.rng.range(20, config.width - 20);
    const y = world.rng.range(20, config.height - 20);
    if (isWaterAt(terrain, x, y)) continue;
    spawnTrinket(world, world.rng.pick(trinkets), x, y);
  }

  // Pedras grandes: ficam pelo chão como parte do cenário até o jogador
  // decidir empurrá-las. Cercar alguém tem de ser obra de QUEM JOGA, então a
  // geração toma dois cuidados para nunca construir parede sozinha:
  //
  //  - longe umas das outras, para não nascerem já enfileiradas;
  //  - longe da água, porque numa ilha de 600×600 com dois lagos uma pedra
  //    encostada na margem tapa a passagem entre o lago e a borda e PARTE o
  //    jardim em dois. Metade da população ficava sem alcançar comida e o
  //    mundo se extinguia — foi exatamente o que aconteceu em dois de três
  //    seeds antes desta folga existir.
  const boulders = countFor(BOULDERS_BASE, config.width, config.height, 3);
  const dropped: Blocker[] = [];
  for (let i = 0, tries = 0; i < boulders && tries < boulders * 120; tries++) {
    const x = world.rng.range(40, config.width - 40);
    const y = world.rng.range(40, config.height - 40);
    if (findNearestWater(terrain, x, y, WATER_CLEARANCE)) continue;
    if (dropped.some((spot) => Math.hypot(spot.x - x, spot.y - y) < BOULDER_RADIUS * 5)) continue;

    // A prova real: pôr esta pedra aqui corta algum pedaço do jardim?
    // Ela pode comer a própria área, nunca mais que isso.
    const before = largestOpenRegion(terrain, dropped, config.width, config.height);
    dropped.push({ x, y, radius: BOULDER_BLOCK });
    const after = largestOpenRegion(terrain, dropped, config.width, config.height);
    if (before - after > BOULDER_FOOTPRINT_CELLS) {
      dropped.pop();
      continue;
    }
    spawnBoulder(world, x, y);
    i++;
  }

  // Algumas frutas já caídas, para o mundo não começar vazio.
  for (const piece of scenery) {
    if (piece.kind === 'tree' && world.rng.chance(0.3)) {
      spawnFruit(world, piece.x + world.rng.range(-14, 14), piece.y + world.rng.range(4, 16));
    }
  }

  const initialPlants = countFor(INITIAL_PLANTS_BASE, config.width, config.height, 10);
  let placed = 0;
  let attempts = 0;
  const maxAttempts = initialPlants * 20;
  while (placed < initialPlants && attempts < maxAttempts) {
    attempts++;
    const x = world.rng.range(0, config.width);
    const y = world.rng.range(0, config.height);
    if (isWaterAt(terrain, x, y)) continue;
    spawnPlant(world, x, y);
    placed++;
  }

  return world;
}
