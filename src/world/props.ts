import { TAU, clamp, createRng } from '@core';
import { defineResource, type System } from '@engine';
import { isWaterAt, type Terrain } from './terrain';
import { countFor } from './density';
import type { SceneryPiece } from './scenery';

/** Tipos de detalhe do chão. */
export const PROP = {
  grassTall: 0,
  grassLow: 1,
  flower: 2,
  pebble: 3,
  root: 4,
  fallenLeaf: 5,
  log: 6,
  moss: 7,
  lilyPad: 8,
  reed: 9,
  shell: 10,
} as const;

export type PropKind = (typeof PROP)[keyof typeof PROP];

/** Props altos entram na ordenação por profundidade; os planos ficam no chão. */
const TALL_PROPS = new Set<number>([PROP.grassTall, PROP.log, PROP.reed]);
export const isTallProp = (kind: number): boolean => TALL_PROPS.has(kind);

export interface Prop {
  kind: number;
  x: number;
  y: number;
  variant: number;
  /** Balanço momentâneo (ao ser cutucado, ou pelo vento). */
  sway: number;
  /** Deslocamento de fase, para o vento não mover tudo em uníssono. */
  phase: number;
}

export const PropsResource = defineResource<Prop[]>('Props');

const SWAY_DECAY = 1.6;

/** Faz o balanço dos props decair depois de um toque. */
export const propSystem: System = {
  name: 'props',
  update(world, dt) {
    const props = world.getResource(PropsResource);
    for (const prop of props) {
      if (prop.sway > 0) prop.sway = Math.max(0, prop.sway - SWAY_DECAY * dt);
    }
  },
};

interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
}

/**
 * Gera o jardim.
 *
 * A vegetação nasce em **grupos** — clareiras floridas, trilhas de pedrinhas,
 * raízes e musgo em volta das árvores, juncos na margem — em vez de ruído
 * uniforme. É o que separa "mapa com coisas espalhadas" de "lugar".
 */
export function generateProps(
  terrain: Terrain,
  scenery: readonly SceneryPiece[],
  width: number,
  height: number,
  seed: number,
): Prop[] {
  const rng: Rng = createRng(seed ^ 0x9a2d1c);
  const props: Prop[] = [];

  // Quantidades escritas como densidade: o jardim tem a mesma cara por tela
  // em qualquer tamanho de mundo.
  const clearings = countFor(9, width, height, 3);
  const grassTufts = countFor(420, width, height, 90);
  const paths = countFor(4, width, height, 2);
  const logs = countFor(7, width, height, 3);

  const add = (kind: number, x: number, y: number, variant = 0): void => {
    if (x < 2 || y < 2 || x > width - 2 || y > height - 2) return;
    props.push({ kind, x, y, variant, sway: 0, phase: rng.range(0, TAU) });
  };

  const onLand = (x: number, y: number): boolean => !isWaterAt(terrain, x, y);

  // ---- Clareiras floridas ---------------------------------------------
  // Manchas densas de flores e grama alta: os cantinhos que convidam a olhar.
  for (let m = 0; m < clearings; m++) {
    const cx = rng.range(60, width - 60);
    const cy = rng.range(60, height - 60);
    if (!onLand(cx, cy)) continue;
    const radius = rng.range(45, 95);
    const flowerVariant = rng.int(4);
    for (let i = 0; i < 40; i++) {
      const angle = rng.range(0, TAU);
      const dist = Math.sqrt(rng.next()) * radius;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      if (!onLand(x, y)) continue;
      // Mais flores no miolo, mais grama nas beiradas.
      const core = dist < radius * 0.6;
      if (core && rng.chance(0.55)) add(PROP.flower, x, y, flowerVariant);
      else add(rng.chance(0.5) ? PROP.grassTall : PROP.grassLow, x, y, rng.int(3));
    }
  }

  // ---- Tapete de grama baixa ------------------------------------------
  for (let i = 0; i < grassTufts; i++) {
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    if (!onLand(x, y)) continue;
    add(rng.chance(0.25) ? PROP.grassTall : PROP.grassLow, x, y, rng.int(3));
  }

  // ---- Trilhas naturais -----------------------------------------------
  // Caminhos de pedrinhas serpenteando, como se algo passasse sempre ali.
  for (let t = 0; t < paths; t++) {
    let x = rng.range(80, width - 80);
    let y = rng.range(80, height - 80);
    let angle = rng.range(0, TAU);
    for (let step = 0; step < 55; step++) {
      angle += rng.range(-0.45, 0.45);
      x = clamp(x + Math.cos(angle) * 16, 10, width - 10);
      y = clamp(y + Math.sin(angle) * 16, 10, height - 10);
      if (!onLand(x, y)) break;
      add(PROP.pebble, x + rng.range(-7, 7), y + rng.range(-7, 7), rng.int(3));
      if (rng.chance(0.4)) add(PROP.grassLow, x + rng.range(-14, 14), y + rng.range(-14, 14), 0);
    }
  }

  // ---- Ao pé das árvores ----------------------------------------------
  // Raízes, musgo e folhas caídas dão a impressão de que a árvore está ali
  // há muito tempo.
  for (const piece of scenery) {
    if (piece.kind === 'tree') {
      // Raízes coladas ao tronco: longe demais viram gravetos soltos.
      for (let i = 0; i < 2; i++) {
        add(PROP.root, piece.x + rng.range(-9, 9), piece.y + rng.range(1, 5), rng.int(2));
      }
      for (let i = 0; i < 7; i++) {
        add(PROP.fallenLeaf, piece.x + rng.range(-32, 32), piece.y + rng.range(-6, 30), rng.int(3));
      }
      for (let i = 0; i < 3; i++) {
        add(PROP.moss, piece.x + rng.range(-24, 24), piece.y + rng.range(-4, 22), rng.int(2));
      }
      if (rng.chance(0.5)) {
        add(PROP.grassTall, piece.x + rng.range(-22, 22), piece.y + rng.range(2, 16), rng.int(3));
      }
    } else if (piece.kind === 'rock') {
      for (let i = 0; i < 3; i++) {
        add(PROP.moss, piece.x + rng.range(-12, 12), piece.y + rng.range(-2, 10), rng.int(2));
      }
      if (rng.chance(0.6))
        add(PROP.pebble, piece.x + rng.range(-18, 18), piece.y + rng.range(0, 12), 0);
    }
  }

  // ---- Troncos caídos --------------------------------------------------
  for (let i = 0; i < logs; i++) {
    const x = rng.range(50, width - 50);
    const y = rng.range(50, height - 50);
    if (!onLand(x, y)) continue;
    add(PROP.log, x, y, rng.int(2));
    for (let j = 0; j < 4; j++) {
      add(PROP.moss, x + rng.range(-14, 14), y + rng.range(-4, 8), rng.int(2));
    }
  }

  // ---- Margem do lago --------------------------------------------------
  // Juncos, vitórias-régias e conchinhas fazem a água ter beira, não borda.
  const step = terrain.cellSize;
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const water = isWaterAt(terrain, x, y);
      const nearWater =
        isWaterAt(terrain, x + step, y) ||
        isWaterAt(terrain, x - step, y) ||
        isWaterAt(terrain, x, y + step) ||
        isWaterAt(terrain, x, y - step);

      if (!water && nearWater) {
        // Beira: juncos e conchinhas.
        if (rng.chance(0.55))
          add(PROP.reed, x + rng.range(-8, 8), y + rng.range(-8, 8), rng.int(2));
        if (rng.chance(0.3))
          add(PROP.shell, x + rng.range(-10, 10), y + rng.range(-10, 10), rng.int(2));
        if (rng.chance(0.4))
          add(PROP.pebble, x + rng.range(-10, 10), y + rng.range(-10, 10), rng.int(3));
      } else if (water && rng.chance(0.22)) {
        // Espelho d'água: vitórias-régias.
        add(PROP.lilyPad, x + rng.range(-9, 9), y + rng.range(-9, 9), rng.int(3));
      }
    }
  }

  // Ordena por Y na geração: os props planos já saem prontos para desenhar
  // sem reordenação em runtime.
  props.sort((a, b) => a.y - b.y);
  return props;
}

/** Faz balançar o que estiver perto do ponto tocado. Devolve quantos mexeram. */
export function swayPropsNear(props: Prop[], x: number, y: number, radius: number): number {
  let touched = 0;
  const r2 = radius * radius;
  for (const prop of props) {
    const dx = prop.x - x;
    const dy = prop.y - y;
    if (dx * dx + dy * dy <= r2) {
      prop.sway = 1;
      touched += 1;
    }
  }
  return touched;
}
