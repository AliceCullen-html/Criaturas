import { clamp01, subjects } from '@core';
import { Transform, type System } from '@engine';
import { Creature, Emotions, Memory, Mind, Personality } from '@creatures';
import { TerrainResource, type Terrain } from '@world';
import { solids } from '../solids';

/**
 * Estar preso.
 *
 * O jogador pode empurrar pedras grandes até fechar um canto com alguém dentro.
 * Nada disso é um "modo": a pedra só é sólida, e o resto é consequência. O que
 * este sistema faz é dar à criatura a **percepção** de que não há saída — e a
 * partir daí quem age são as emoções que já existiam.
 *
 * O medo cresce enquanto durar, o lugar fica marcado como ruim para sempre, e
 * a confiança em quem construiu a parede vai junto. Solta a criatura e o medo
 * passa; o trauma e a lembrança do lugar, não. É o mesmo princípio do gesto
 * brusco: consequência que fica.
 */

/** Grade do alagamento. Grossa o bastante para ser barata, fina para ser justa. */
const CELL = 20;
/**
 * Se a criatura alcança menos células que isto, está cercada. 24 células de 20px
 * é uma área de ~10.000px² — um quintalzinho de 100×100 num mundo de 600×600.
 */
const FREE_CELLS = 24;

/**
 * O jardim inteiro é reavaliado uma vez por segundo. O acumulador é daqui, e
 * não de `world.tick`: o contador de ticks só anda dentro do loop do app, então
 * um sistema que dependesse dele simplesmente não rodaria em teste.
 */
const CHECK_PERIOD = 1;
let sinceCheck = 0;

const MEDO_POR_SEGUNDO = 0.22;
const ESTRESSE_POR_SEGUNDO = 0.3;
const TRAUMA_POR_SEGUNDO = 0.02;

// Buffers reaproveitados: o alagamento roda muitas vezes por segundo.
const queueX = new Int32Array(FREE_CELLS * 4);
const queueY = new Int32Array(FREE_CELLS * 4);
const seen = new Set<number>();

/**
 * Alagamento limitado: devolve `true` se a região alcançável for pequena, isto
 * é, se a criatura estiver cercada. Para assim que encontra espaço suficiente,
 * então o caso comum (jardim aberto) custa quase nada.
 */
function isPennedIn(terrain: Terrain, x: number, y: number, width: number, height: number): boolean {
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const startX = Math.floor(x / CELL);
  const startY = Math.floor(y / CELL);

  seen.clear();
  let head = 0;
  let tail = 0;
  queueX[tail] = startX;
  queueY[tail] = startY;
  tail++;
  seen.add(startY * cols + startX);

  let reached = 0;
  while (head < tail) {
    const cx = queueX[head]!;
    const cy = queueY[head]!;
    head++;
    reached++;
    if (reached >= FREE_CELLS) return false; // tem para onde ir

    for (let i = 0; i < 4; i++) {
      const nx = cx + (i === 0 ? 1 : i === 1 ? -1 : 0);
      const ny = cy + (i === 2 ? 1 : i === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const key = ny * cols + nx;
      if (seen.has(key)) continue;
      // Testa o centro da célula: é onde a criatura de fato passaria.
      if (solids.blocked(terrain, nx * CELL + CELL / 2, ny * CELL + CELL / 2)) continue;
      seen.add(key);
      if (tail < queueX.length) {
        queueX[tail] = nx;
        queueY[tail] = ny;
        tail++;
      }
    }
  }
  // A fila secou sem alcançar espaço: está cercada.
  return true;
}

export const confinementSystem: System = {
  name: 'confinement',
  update(world, dt) {
    const transforms = world.store(Transform);
    const emotionsStore = world.store(Emotions);
    const memories = world.store(Memory);
    const minds = world.store(Mind);
    const traitsStore = world.store(Personality);
    const terrain = world.getResource(TerrainResource);
    const { width, height } = world.config;

    sinceCheck += dt;
    if (sinceCheck < CHECK_PERIOD) return;
    const elapsed = sinceCheck;
    sinceCheck = 0;

    solids.rebuild(world);
    // Sem pedra nenhuma solta no mundo não há como cercar ninguém.
    if (solids.count === 0) return;

    world.store(Creature).forEach((_tag, entity) => {
      const transform = transforms.get(entity);
      const emotions = emotionsStore.get(entity);
      const mind = minds.get(entity);
      if (!transform || !emotions || !mind) return;

      if (!isPennedIn(terrain, transform.x, transform.y, width, height)) return;

      // Quanto mais medrosa, pior é ficar sem saída.
      const traits = traitsStore.get(entity);
      const timid = 1 - (traits?.bravery ?? 0.5);
      const weight = elapsed * (0.6 + timid);

      emotions.fear = clamp01(emotions.fear + MEDO_POR_SEGUNDO * weight);
      emotions.stress = clamp01(emotions.stress + ESTRESSE_POR_SEGUNDO * weight);
      emotions.happiness = clamp01(emotions.happiness - 0.2 * weight);
      emotions.trauma = clamp01(emotions.trauma + TRAUMA_POR_SEGUNDO * weight);
      emotions.trust = clamp01(emotions.trust - 0.05 * weight);
      mind.commitment = 0;

      const memory = memories.get(entity);
      if (!memory) return;

      // O lugar fica marcado, e quem construiu a parede também.
      memory.record(subjects.place(transform.x, transform.y), -0.9, 0.5 * weight);
      memory.record(subjects.player(), -0.8, 0.25 * weight);

      // Uma lembrança só, na primeira vez que o medo estoura.
      if (emotions.fear > 0.7 && !memory.episodes.some((episode) => episode.emotion === 'preso')) {
        memory.addEpisode({
          text: 'Fiquei presa aqui e não conseguia sair',
          valence: -1,
          intensity: 1,
          emotion: 'preso',
          tick: world.tick,
          x: transform.x,
          y: transform.y,
          actor: 'você',
        });
      }
    });
  },
};
