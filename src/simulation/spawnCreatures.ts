import type { World } from '@engine';
import { registerCreatureComponents, spawnCreature } from '@creatures';
import {
  BOULDER_RADIUS,
  Item,
  TerrainResource,
  findNearestWater,
  makeMainlandTest,
  type Blocker,
} from '@world';
import { Transform } from '@engine';
import { solids } from './solids';
import { Plan } from './systems/planSystem';
import { Order } from './orders';
import { Budding } from './species';
import { Chatter } from './systems/teachingSystem';

/**
 * A que distância da água uma criatura pode começar a vida.
 *
 * Antes ela nascia em qualquer ponto do jardim, e num mundo de 900×900 isso
 * significava nascer a trezentos pixels do lago mais próximo. A sede vai de
 * zero a mortal em pouco mais de um minuto; andando, são quase dez segundos
 * por cem pixels. O resultado media-se: em cinco minutos de simulação, VINTE E
 * OITO das trinta e quatro criaturas iniciais morriam de sede — o jogador
 * abria o jogo e assistia a uma chacina antes de qualquer coisa acontecer.
 *
 * Duzentos pixels é a ida e a volta com folga. Não muda nenhuma regra do corpo:
 * muda só onde a vida começa, que é decisão de mundo, não de metabolismo. E tem
 * um efeito colateral bem-vindo — todo mundo começa em volta da água, então
 * todo mundo se encontra.
 */
const WATER_REACH = 200;

/** Registra os componentes de criatura e povoa o mundo com `count` criaturas em solo. */
export interface SpawnGroup {
  sex?: 'M' | 'F' | 'none';
  /** Fração da vida já vivida ao nascer. O ancestral começa recém-nascido. */
  ageFraction?: number;
}

export function spawnCreatures(world: World, count: number, group: SpawnGroup = {}): void {
  registerCreatureComponents(world);
  // O plano em curso vive na simulação, não em @creatures: rotina é caso de uso.
  // A ordem do jogador é da mesma natureza — vem de fora da criatura.
  world.register(Plan);
  world.register(Order);
  // Progresso de duplicação: existe só enquanto a espécie é assexuada.
  world.register(Budding);
  // Ritmo da fala: quem sabe uma palavra a repete de tempos em tempos.
  world.register(Chatter);
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
    // Bicho nasce perto de água. Enquanto a maior parte das tentativas ainda
    // resta, exige-se o bebedouro por perto; no fim, aceita-se qualquer chão
    // firme, para um mundo de lago pequeno não ficar sem população.
    const demanding = attempts < maxAttempts * 0.7;
    if (demanding && !findNearestWater(terrain, x, y, WATER_REACH)) continue;
    spawnCreature(world, x, y, group);
    placed++;
  }
}
