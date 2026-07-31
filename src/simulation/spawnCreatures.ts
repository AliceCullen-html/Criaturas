import type { World } from '@engine';
import { registerCreatureComponents, spawnCreature } from '@creatures';
import {
  BOULDER_RADIUS,
  Item,
  TerrainResource,
  findNearestWater,
  makeMainlandTest,
  SceneryResource,
  tileAt,
  type Blocker,
  type SceneryPiece,
} from '@world';
import { Transform } from '@engine';
import { solids } from './solids';
import { Plan } from './systems/planSystem';
import { Order } from './orders';
import { Budding } from './species';
import { Chatter } from './systems/teachingSystem';
import { Goal } from './systems/goalSystem';

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

/**
 * O QUE TAPA O PRIMEIRO OVO.
 *
 * O jogo abre com uma casca parada no chão e a câmera apontada para ela. Só que
 * a conta de "esse chão serve?" olhava a água e as pedras grandes e ignorava as
 * árvores — que são a coisa mais alta e mais larga do jardim. Medido nas oito
 * sementes de teste: em CINCO delas, a do jogo inclusive, havia uma árvore na
 * casa da frente. O jogo abria com o ovo atrás de uma copa, e a primeira coisa
 * que o jogador tinha de fazer era arrastar uma árvore para achar o começo do
 * próprio jogo.
 *
 * A conta não é um círculo em volta: é a PROFUNDIDADE. Nesta projeção o que
 * está desenhado por cima é o que tem `x + y` maior — o que está à frente. Uma
 * árvore atrás do ovo não atrapalha nada, e exigir clareira lá só empurraria a
 * casca para os cantos vazios do mapa. O que se cobra é o caminho entre o ovo e
 * a câmera.
 */
const COVER_SPREAD = 2;

/** Alguma peça de cenário está desenhada por cima deste ponto? */
function underCover(scenery: readonly SceneryPiece[], x: number, y: number): boolean {
  const { col, row } = tileAt(x, y);
  for (const piece of scenery) {
    const dc = piece.col - col;
    const dr = piece.row - row;
    if (Math.abs(dc) > COVER_SPREAD || Math.abs(dr) > COVER_SPREAD) continue;
    // Só o que vem depois na ordem de desenho pode esconder alguma coisa.
    if (dc + dr >= 0) return true;
  }
  return false;
}

/**
 * E NEM COLADO NA BORDA DO MUNDO.
 *
 * Medido junto: uma das sementes punha o ovo a dois pixels do topo, com metade
 * da casca fora da tela. Também não é um começo de jogo.
 */
const EDGE_MARGIN = 90;

/** Registra os componentes de criatura e povoa o mundo com `count` criaturas em solo. */
export interface SpawnGroup {
  sex?: 'M' | 'F' | 'none';
  /** Fração da vida já vivida ao nascer. O ancestral começa recém-nascido. */
  ageFraction?: number;
  /** Começa dentro de um ovo — é assim que o jardim abre. */
  asEgg?: boolean;
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
  // O projeto de vida: o que ela anda querendo, para além do próximo minuto.
  world.register(Goal);
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

  // O cenário só entra na conta para o OVO que abre o jogo: é ele que o
  // jogador precisa enxergar. Um jardim já povoado pode ter bicho embaixo de
  // árvore à vontade — aliás é onde eles gostam de ficar, na sombra.
  const scenery = world.hasResource(SceneryResource) ? world.getResource(SceneryResource) : [];
  const needsClearing = group.asEgg === true && scenery.length > 0;

  let placed = 0;
  let attempts = 0;
  // O PRIMEIRO OVO GANHA MUITAS TENTATIVAS. É um só, acontece uma vez na
  // abertura do mundo, e a clareira que ele exige é rara: com um pouco mais de
  // um quarto do tabuleiro ocupado, a chance de um ponto qualquer servir é de
  // uns poucos por cento. Quarenta tentativas não achariam nunca.
  const maxAttempts = group.asEgg === true ? 4000 : count * 40;
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
    // A clareira é exigida enquanto houver tentativas de sobra. No aperto ela
    // cede — um mundo pequeno e muito arborizado pode não ter clareira nenhuma,
    // e é melhor um ovo na sombra do que um jardim sem ovo.
    if (needsClearing && demanding) {
      if (underCover(scenery, x, y)) continue;
      if (
        x < EDGE_MARGIN ||
        y < EDGE_MARGIN ||
        x > world.config.width - EDGE_MARGIN ||
        y > world.config.height - EDGE_MARGIN
      ) {
        continue;
      }
    }
    spawnCreature(world, x, y, group);
    placed++;
  }
}
