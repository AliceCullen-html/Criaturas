import { createRng, type Rng } from '@core';
import type { Texture } from 'pixi.js';
import { PixelBuffer, mix, shade } from '../pixel/PixelBuffer';

const GRASS_BASE = 0x5c9e48;
const GRASS_DARK = 0x4e8c3f;
const GRASS_LIGHT = 0x69ac52;
const WATER_DEEP = 0x2f6aa0;
const WATER_MID = 0x3f83bd;
const WATER_LIGHT = 0x6fb0dd;
const SAND = 0xcdb789;

/**
 * Tile de grama.
 *
 * A versão antiga era ruído aleatório pixel a pixel: de perto some, de longe
 * vira um carpete verde chapado e estático. Grama de verdade tem MANCHAS —
 * áreas mais escuras onde é densa, mais claras onde o sol bate — e é a mancha,
 * não o chuvisco, que dá vida ao chão.
 *
 * As manchas vêm de senóides sobrepostas em vez de ruído, porque a soma delas
 * é contínua e **fecha nas bordas do tile**: sem isso aparece uma grade de
 * costuras a cada 45 pixels.
 */
export function makeGrassTexture(seed: number): Texture {
  const rng = createRng(seed);
  const size = 48;
  const buffer = new PixelBuffer(size, size);
  const TAU = Math.PI * 2;

  // Três ondas de períodos inteiros: casam nas bordas, então o tile repete sem
  // emenda visível.
  const bands = [
    { fx: 1, fy: 1, phase: rng.range(0, TAU), weight: 0.55 },
    { fx: 2, fy: 1, phase: rng.range(0, TAU), weight: 0.3 },
    { fx: 1, fy: 3, phase: rng.range(0, TAU), weight: 0.25 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      for (const band of bands) {
        value +=
          Math.sin((x / size) * TAU * band.fx + band.phase) *
          Math.cos((y / size) * TAU * band.fy + band.phase * 0.7) *
          band.weight;
      }
      // Uma pitada de granulado por cima, só para não ficar liso demais.
      value += (rng.next() - 0.5) * 0.35;

      const color =
        value < -0.35
          ? shade(GRASS_DARK, 0.94)
          : value < 0
            ? GRASS_DARK
            : value < 0.38
              ? GRASS_BASE
              : GRASS_LIGHT;
      buffer.set(x, y, color);
    }
  }

  // Fiapos de grama em pé, seguindo as manchas claras.
  for (let i = 0; i < 40; i++) {
    const x = rng.int(size);
    const y = rng.int(size);
    const blade = mix(GRASS_LIGHT, 0xffffff, 0.12);
    buffer.set(x, y, blade);
    buffer.set(x, y - 1, GRASS_LIGHT);
  }
  return buffer.toTexture();
}

/**
 * Manchões suaves de grama, desenhados por cima do tile.
 *
 * O tile resolve a textura de perto; isto resolve a de longe. São elipses
 * grandes e translúcidas de verdes vizinhos que quebram a repetição — o olho
 * deixa de enxergar a grade e passa a enxergar um campo.
 */
export function makeGrassPatchTextures(): Texture[] {
  const rng = createRng(0x6a55);
  const tones = [shade(GRASS_DARK, 0.9), GRASS_DARK, GRASS_LIGHT, mix(GRASS_LIGHT, 0xd8e88a, 0.35)];

  return tones.map((tone) => {
    const size = 64;
    const buffer = new PixelBuffer(size, size);
    const center = (size - 1) / 2;
    // Borda irregular: um manchão com contorno de elipse perfeita vira bolha.
    const waves = [
      { freq: 2 + rng.int(2), phase: rng.range(0, Math.PI * 2), depth: 0.2 },
      { freq: 5 + rng.int(3), phase: rng.range(0, Math.PI * 2), depth: 0.1 },
    ];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - center) / center;
        const dy = (y - center) / center;
        const distance = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        let edge = 1;
        for (const wave of waves) edge += Math.sin(angle * wave.freq + wave.phase) * wave.depth;
        if (distance > edge) continue;
        // Desbota até sumir na borda: sem contorno duro, sem "adesivo".
        const fade = 1 - distance / edge;
        buffer.set(x, y, tone, Math.round(150 * fade * fade));
      }
    }
    return buffer.toTexture();
  });
}

/**
 * Quadros de água animados.
 *
 * A versão antiga tinha uma linha de brilho HORIZONTAL atravessando o tile.
 * Repetida célula a célula, as linhas se alinhavam e o lago inteiro virava uma
 * bandeira listrada. Agora a superfície é mosqueada — manchas de fundo e de
 * raso que andam devagar entre os quadros — e o brilho aparece em pontos
 * soltos, nunca em faixa.
 */
export function makeWaterTextures(): Texture[] {
  const frames = 6;
  const size = 16;
  const out: Texture[] = [];
  const TAU = Math.PI * 2;

  for (let f = 0; f < frames; f++) {
    const buffer = new PixelBuffer(size, size);
    const drift = (f / frames) * TAU;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Períodos inteiros no tile: repete sem costura.
        const value =
          Math.sin((x / size) * TAU + drift) * Math.cos((y / size) * TAU * 2 - drift * 0.6) * 0.6 +
          Math.sin((x / size) * TAU * 3 - drift) * Math.cos((y / size) * TAU + drift) * 0.4;
        // Tons VIZINHOS, não contrastantes: com a diferença antiga o padrão da
        // senóide aparecia como um xadrez tecido em cima do lago inteiro.
        buffer.set(
          x,
          y,
          value < -0.3
            ? shade(WATER_DEEP, 0.95)
            : value < 0.45
              ? WATER_DEEP
              : mix(WATER_DEEP, WATER_MID, 0.45),
        );
      }
    }
    // Faíscas de sol na superfície, em pontos isolados.
    const sparkRng = createRng(0x5ea + f);
    for (let i = 0; i < 5; i++) {
      const x = sparkRng.int(size);
      const y = sparkRng.int(size);
      buffer.set(x, y, WATER_LIGHT);
      if (sparkRng.chance(0.5)) buffer.set(x + 1, y, mix(WATER_LIGHT, 0xffffff, 0.35));
    }
    out.push(buffer.toTexture());
  }
  return out;
}

/**
 * Areia da margem.
 *
 * Não é um quadrado cheio: é uma mancha de borda macia. Quadrados cheios
 * lado a lado formavam uma FAIXA de contorno reto contra a grama — parecia um
 * muro pintado em volta do lago, não uma praia. Com a borda desbotando, as
 * manchas vizinhas se somam no miolo e se dissolvem na grama.
 */
export function makeSandTexture(seed: number): Texture {
  const rng = createRng(seed);
  const size = 20;
  const buffer = new PixelBuffer(size, size);
  const center = (size - 1) / 2;
  const waves = [
    { freq: 3, phase: rng.range(0, Math.PI * 2), depth: 0.16 },
    { freq: 6, phase: rng.range(0, Math.PI * 2), depth: 0.09 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      let edge = 0.95;
      for (const wave of waves) edge += Math.sin(angle * wave.freq + wave.phase) * wave.depth;
      if (distance > edge) continue;

      const r = rng.next();
      const tone = r < 0.22 ? shade(SAND, 0.92) : r > 0.85 ? mix(SAND, 0xffffff, 0.18) : SAND;
      // Opaca no miolo, sumindo na borda.
      const fade = Math.min(1, (1 - distance / edge) * 2.6);
      buffer.set(x, y, tone, Math.round(255 * fade));
    }
  }
  return buffer.toTexture();
}

function bakeShadow(buffer: PixelBuffer, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) buffer.set(x, y, 0x1a1e12, 60);
    }
  }
}

/** Sprites de recurso (índice = variante): maçã, frutinhas, cogumelo, flor, broto, arbusto. */
export function makeResourceTextures(): Texture[] {
  const apple = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 4, 1.6);
    b.disc(8, 8, 4, shade(0xd6473f, 0.7));
    b.disc(8, 8, 3.4, 0xd6473f);
    b.disc(6.6, 6.6, 1.2, mix(0xd6473f, 0xffffff, 0.5));
    b.rect(8, 3, 1, 2, 0x6b4a2b);
    b.set(9, 3, 0x6ab04a);
    b.set(10, 3, 0x6ab04a);
    return b.toTexture();
  };
  const berries = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 4, 1.6);
    for (const [x, y] of [
      [6, 8],
      [10, 8],
      [8, 10],
    ] as const) {
      b.disc(x, y, 2, shade(0x5a6fc0, 0.7));
      b.disc(x, y, 1.4, 0x6f86d6);
      b.set(x - 1, y - 1, mix(0x6f86d6, 0xffffff, 0.5));
    }
    b.rect(8, 4, 1, 3, 0x4e7a3c);
    return b.toTexture();
  };
  const mushroom = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 4, 1.6);
    b.rect(7, 8, 2, 4, 0xe6dcc0);
    b.disc(8, 7, 4, shade(0xc85149, 0.75));
    for (let x = 4; x <= 12; x++) if (((x + 8) & 1) === 0) b.set(x, 8, 0xc85149);
    b.rect(4, 8, 9, 1, 0xc85149);
    b.set(6, 5, 0xf0e6d0);
    b.set(10, 6, 0xf0e6d0);
    return b.toTexture();
  };
  const flower = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 3, 1.4);
    b.rect(8, 8, 1, 5, 0x4e7a3c);
    b.set(7, 10, 0x4e7a3c);
    const petal = 0xe89ac0;
    for (const [x, y] of [
      [8, 5],
      [6, 7],
      [10, 7],
      [7, 9],
      [9, 9],
    ] as const)
      b.disc(x, y, 1.2, petal);
    b.disc(8, 7, 1, 0xf3d06b);
    return b.toTexture();
  };
  const sprout = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 3, 1.2);
    b.rect(8, 9, 1, 4, 0x4e7a3c);
    b.disc(6, 9, 1.6, 0x6fae52);
    b.disc(10, 9, 1.6, 0x6fae52);
    b.disc(8, 7, 1.4, 0x7cbf5c);
    return b.toTexture();
  };
  const bush = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 4.5, 1.8);
    b.disc(6, 9, 3.2, shade(0x4e8c3f, 0.85));
    b.disc(10, 9, 3.2, shade(0x4e8c3f, 0.85));
    b.disc(8, 8, 3.6, 0x59a049);
    for (const [x, y] of [
      [6, 9],
      [10, 8],
      [8, 11],
    ] as const)
      b.set(x, y, 0xd6473f);
    return b.toTexture();
  };
  // --- Objetos que o jogador pode pegar e espalhar ---------------------
  const stick = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 12, 5, 1.3);
    const wood = 0x8a6a3c;
    for (let i = 0; i < 12; i++) b.set(2 + i, 9 - Math.round(i * 0.25), wood);
    for (let i = 0; i < 12; i++) b.set(2 + i, 10 - Math.round(i * 0.25), shade(wood, 0.78));
    b.set(6, 7, wood);
    b.set(7, 6, wood);
    return b.toTexture();
  };
  const seed = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 12, 3, 1.2);
    for (const [x, y] of [
      [7, 9],
      [9, 10],
      [8, 11],
    ] as const) {
      b.ellipse(x, y, 1.6, 1.1, 0xb89a5c);
      b.set(x - 1, y - 1, 0xd8c088);
    }
    return b.toTexture();
  };
  const feather = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 3, 1.2);
    const quill = 0xe8eef5;
    b.ellipse(8, 8, 2.2, 5, quill);
    b.ellipse(8, 8, 1.1, 4.4, mix(quill, 0x9ab4d0, 0.5));
    for (let i = 0; i < 9; i++) b.set(8, 4 + i, 0xc8d4e0);
    b.set(8, 13, 0xb0bcc8);
    return b.toTexture();
  };
  const stone = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 12, 4.5, 1.5);
    b.ellipse(8, 9, 4, 3, shade(0x9aa0ab, 0.75));
    b.ellipse(7.4, 8.2, 3.4, 2.4, 0x9aa0ab);
    b.disc(6.4, 7.2, 1.1, mix(0x9aa0ab, 0xffffff, 0.4));
    return b.toTexture();
  };
  const shellItem = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 12, 4, 1.4);
    const color = 0xf0dcc8;
    b.ellipse(8, 9, 4, 3.2, shade(color, 0.8));
    b.ellipse(8, 8.4, 3.4, 2.7, color);
    for (let i = -3; i <= 3; i++) b.set(8 + i, 8 - Math.abs(i) * 0.6, shade(color, 0.85));
    return b.toTexture();
  };

  // --- Raridades: recompensam quem repara nos detalhes ------------------
  const goldenFruit = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 4, 1.6);
    const gold = 0xf2c341;
    b.disc(8, 8, 4.2, shade(gold, 0.72));
    b.disc(8, 8, 3.5, gold);
    b.disc(6.6, 6.6, 1.3, 0xfff0b0);
    b.rect(8, 3, 1, 2, 0x8a6a3c);
    b.set(9, 3, 0x6ab04a);
    // Faíscas.
    b.set(3, 5, 0xfff6d0);
    b.set(13, 10, 0xfff6d0);
    b.set(12, 4, 0xfff6d0);
    return b.toTexture();
  };
  const glowMushroom = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 13, 4, 1.6);
    const glow = 0x7fe8d0;
    b.rect(7, 8, 2, 4, 0xdff5ef);
    b.disc(8, 7, 4, shade(glow, 0.7));
    b.disc(8, 7, 3.2, glow);
    b.set(6, 5, 0xd8fff5);
    b.set(10, 6, 0xd8fff5);
    b.rect(4, 8, 9, 1, mix(glow, 0xffffff, 0.4));
    return b.toTexture();
  };
  const shinyStone = (): Texture => {
    const b = new PixelBuffer(16, 16);
    bakeShadow(b, 8, 12, 4, 1.4);
    const gem = 0x9a7ad6;
    b.ellipse(8, 9, 3.6, 2.8, shade(gem, 0.7));
    b.ellipse(7.6, 8.4, 3, 2.2, gem);
    b.disc(6.8, 7.6, 1.1, 0xe0d0ff);
    b.set(11, 6, 0xfffaff);
    b.set(4, 11, 0xfffaff);
    return b.toTexture();
  };

  // Pedra grande: o único objeto que as criaturas não atravessam. Precisa
  // parecer PESADA — larga, escura embaixo, com sombra bem plantada no chão.
  const boulder = (): Texture => {
    const b = new PixelBuffer(28, 24);
    bakeShadow(b, 14, 20, 9, 3);
    const rock = 0x8d8f95;
    b.ellipse(14, 14, 10.5, 7.5, shade(rock, 0.62));
    b.ellipse(14, 12.6, 10, 7, rock);
    b.ellipse(12, 10.5, 6.5, 4.2, mix(rock, 0xffffff, 0.22));
    b.ellipse(10.5, 9, 3.4, 2.2, mix(rock, 0xffffff, 0.38));
    // Rachaduras e musgo: pedra de jardim, não bola de boliche.
    b.rect(15, 12, 1, 5, shade(rock, 0.5));
    b.rect(16, 15, 3, 1, shade(rock, 0.5));
    b.ellipse(18, 17, 2.6, 1.4, 0x6f9a5e);
    b.ellipse(8, 17, 2, 1.1, 0x6f9a5e);
    return b.toTexture();
  };

  return [
    apple(),
    berries(),
    mushroom(),
    flower(),
    sprout(),
    bush(),
    stick(),
    seed(),
    feather(),
    stone(),
    shellItem(),
    goldenFruit(),
    glowMushroom(),
    shinyStone(),
    boulder(),
  ];
}

export interface SceneryTextures {
  /** Variantes de árvore: comum, florida, frutífera e com ninho. */
  tree: Texture[];
  rock: Texture[];
  bush: Texture[];
}

/** Cenário decorativo (não interativo): árvore, pedra, arbusto — com sombra. */
export function makeSceneryTextures(rng: Rng): SceneryTextures {
  /**
   * Árvore com tronco, galhos visíveis e copa em camadas. `decor` acrescenta
   * flores, frutos ou um ninho — a árvore deixa de ser enfeite e passa a
   * contar o que está acontecendo nela.
   */
  const tree = (decor: 'plain' | 'flowers' | 'fruit' | 'nest'): Texture => {
    const b = new PixelBuffer(38, 46);
    const bark = 0x6b4a2b;
    const barkLight = shade(bark, 1.2);
    const leaf = 0x4f9440;

    bakeShadow(b, 19, 43, 11, 3.5);

    // Tronco com leve alargamento na base.
    b.rect(17, 26, 5, 16, bark);
    b.rect(17, 26, 1, 16, barkLight);
    b.rect(15, 40, 9, 2, shade(bark, 0.85));
    b.rect(16, 38, 7, 2, shade(bark, 0.92));

    // Galhos saindo do tronco para a copa.
    for (const [dx, dy, len] of [
      [-1, -1, 7],
      [1, -1, 7],
      [-1, -1, 4],
    ] as const) {
      let bx = 19;
      let by = 28;
      for (let i = 0; i < len; i++) {
        bx += dx;
        by += dy;
        b.set(bx, by, bark);
        b.set(bx, by + 1, shade(bark, 0.8));
      }
    }

    // Copa em três volumes, com brilho no topo.
    b.disc(19, 18, 11.5, shade(leaf, 0.8));
    b.disc(13, 16, 8, leaf);
    b.disc(25, 17, 8, leaf);
    b.disc(19, 12, 8.5, mix(leaf, 0xffffff, 0.14));
    for (let i = 0; i < 20; i++) {
      b.set(8 + rng.int(23), 6 + rng.int(20), mix(leaf, 0xffffff, 0.26));
    }

    if (decor === 'flowers') {
      const petal = 0xf2b8d0;
      for (let i = 0; i < 16; i++) {
        b.disc(9 + rng.int(21), 7 + rng.int(18), 1.2, petal);
      }
      b.disc(14, 10, 1.4, mix(petal, 0xffffff, 0.5));
    } else if (decor === 'fruit') {
      // Frutos amadurecendo nos galhos, antes de caírem.
      for (let i = 0; i < 7; i++) {
        const fx = 10 + rng.int(19);
        const fy = 12 + rng.int(14);
        b.disc(fx, fy, 1.8, 0xb8352f);
        b.disc(fx, fy, 1.2, 0xd6473f);
        b.set(fx - 1, fy - 1, 0xef7a72);
      }
    } else if (decor === 'nest') {
      const straw = 0xa8814a;
      b.ellipse(24, 13, 4, 2.4, shade(straw, 0.8));
      b.ellipse(24, 12.4, 3.4, 1.9, straw);
      b.ellipse(24, 12.6, 2.2, 1.1, shade(straw, 0.65));
      // Ovinhos.
      b.set(23, 12, 0xeaf0f5);
      b.set(25, 12, 0xeaf0f5);
    }

    return b.toTexture();
  };
  const rock = (): Texture => {
    const b = new PixelBuffer(20, 16);
    bakeShadow(b, 10, 13, 7, 2);
    b.disc(10, 9, 6, shade(0x8b8f99, 0.8));
    b.disc(9, 8, 5, 0x9aa0ab);
    b.disc(7, 6, 2, mix(0x9aa0ab, 0xffffff, 0.35));
    return b.toTexture();
  };
  const bush = (): Texture => {
    const b = new PixelBuffer(20, 16);
    bakeShadow(b, 10, 13, 7, 2);
    b.disc(7, 9, 4, shade(0x4e8c3f, 0.85));
    b.disc(13, 9, 4, shade(0x4e8c3f, 0.85));
    b.disc(10, 7, 4.5, 0x59a049);
    return b.toTexture();
  };
  return {
    tree: [tree('plain'), tree('flowers'), tree('fruit'), tree('nest')],
    rock: [rock(), rock()],
    bush: [bush(), bush()],
  };
}

/** Nuvenzinha de poeira dos passos. */
export function makeDustTexture(): Texture {
  const b = new PixelBuffer(8, 8);
  b.disc(4, 4, 2.6, 0xd8cdb4);
  b.disc(3, 3, 1.4, 0xefe6d2);
  return b.toTexture();
}

/** Pequenas folhas para as partículas. */
export function makeLeafTextures(): Texture[] {
  const colors = [0xd98a4a, 0xe0b048, 0xc86b3c, 0x8fae4a];
  return colors.map((color) => {
    const b = new PixelBuffer(6, 6);
    b.disc(3, 3, 2, color);
    b.set(3, 1, shade(color, 0.7));
    b.set(2, 2, mix(color, 0xffffff, 0.4));
    return b.toTexture();
  });
}
