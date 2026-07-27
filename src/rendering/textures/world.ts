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
 * Casas do tabuleiro.
 *
 * Cada uma é um QUADRADO de `TILE` pixels desenhado dentro do container do
 * chão — e, como aquele container carrega a matriz isométrica, o quadrado sai
 * losango de graça. É daí que vem a cara de tabuleiro: não há nenhuma conta de
 * losango neste arquivo, só quadrados.
 *
 * O que faz a grade aparecer é o acabamento das bordas. Projetadas, a borda
 * direita e a de baixo do quadrado viram as duas arestas DA FRENTE do losango —
 * as que pegariam luz se a casa tivesse espessura. Escurecendo as duas, cada
 * casa ganha um beiral e o chão deixa de ser um lençol verde: vira piso.
 *
 * As variantes existem porque um tabuleiro de casas idênticas é uma planilha.
 * Elas diferem só no tom e nos fiapos de grama — o suficiente para o olho ver
 * um gramado dividido em canteiros, não um xadrez.
 */
export function makeTileTextures(size: number): Texture[] {
  const rng = createRng(0x7113);
  const TAU = Math.PI * 2;
  const tones = [
    GRASS_BASE,
    mix(GRASS_BASE, GRASS_LIGHT, 0.45),
    GRASS_DARK,
    mix(GRASS_BASE, GRASS_DARK, 0.5),
    mix(GRASS_LIGHT, 0xd8e88a, 0.18),
    GRASS_BASE,
  ];

  return tones.map((tone, index) => {
    const buffer = new PixelBuffer(size, size);
    const phase = rng.range(0, TAU);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Ondulação suave dentro da casa: sem ela o quadrado é um adesivo de
        // cor chapada, e o gramado inteiro fica plástico.
        const value =
          Math.sin((x / size) * TAU + phase) * Math.cos((y / size) * TAU * 2 - phase) * 0.5 +
          (rng.next() - 0.5) * 0.3;
        buffer.set(x, y, value < -0.25 ? shade(tone, 0.94) : value > 0.3 ? shade(tone, 1.06) : tone);
      }
    }

    // Fiapos de grama em pé, longe das bordas para não sujar o contorno.
    for (let i = 0; i < Math.round(size * 0.5); i++) {
      const x = 3 + rng.int(size - 6);
      const y = 3 + rng.int(size - 6);
      buffer.set(x, y, mix(tone, 0xffffff, 0.16));
      buffer.set(x, y - 1, shade(tone, 1.1));
    }

    // O beiral: duas bordas escuras e uma clara na quina de trás. Projetado,
    // isso lê como um degrauzinho de terra entre uma casa e a seguinte.
    const lip = shade(tone, 0.7);
    const rim = shade(tone, 0.82);
    for (let i = 0; i < size; i++) {
      buffer.set(size - 1, i, lip);
      buffer.set(size - 2, i, rim);
      buffer.set(i, size - 1, lip);
      buffer.set(i, size - 2, rim);
      buffer.set(0, i, shade(tone, 1.08));
      buffer.set(i, 0, shade(tone, 1.08));
    }

    // Uma casa em cada seis ganha uma pedrinha ou um tufo mais forte, para o
    // olho ter onde parar quando corre o campo.
    if (index === 5) {
      const x = 12 + rng.int(size - 24);
      const y = 12 + rng.int(size - 24);
      buffer.ellipse(x, y, 3, 2, shade(0x9aa0ab, 0.9));
      buffer.ellipse(x - 0.5, y - 0.5, 2.2, 1.4, 0x9aa0ab);
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

/**
 * Sombra elíptica no pé da peça.
 *
 * Achatada em 3:1 porque, na vista isométrica, o chão que ela toca já está
 * inclinado: uma sombra redonda pareceria um disco de pé encostado na árvore.
 */
function groundShadow(b: PixelBuffer, cx: number, cy: number, rx: number): void {
  b.ellipse(cx, cy, rx, rx / 3, 0x1a1e12, 55);
  b.ellipse(cx, cy, rx * 0.62, rx / 4.4, 0x1a1e12, 45);
}

/**
 * Cenário: árvore, pedra e moita — cada um do tamanho de uma casa.
 *
 * A escala aqui não é gosto, é regra do tabuleiro. A peça precisa preencher a
 * casa em que está (senão a grade não significa nada) e precisa ser MUITO
 * maior que uma criatura de 22 pixels — é a diferença de tamanho entre o bicho
 * e a árvore que dá escala ao mundo inteiro. As versões antigas tinham 38×46 e
 * 20×16: do tamanho das criaturas, e o jardim parecia uma maquete.
 */
export function makeSceneryTextures(rng: Rng): SceneryTextures {
  /**
   * Árvore: tronco grosso com raiz aparente, galhos e copa em volumes. `decor`
   * acrescenta flores, frutos ou um ninho — a árvore deixa de ser enfeite e
   * passa a contar o que está acontecendo nela.
   */
  const tree = (decor: 'plain' | 'flowers' | 'fruit' | 'nest'): Texture => {
    const b = new PixelBuffer(64, 84);
    const bark = 0x6b4a2b;
    const barkDark = shade(bark, 0.72);
    const barkLight = shade(bark, 1.25);
    const leaf = 0x4f9440;
    const leafDark = shade(leaf, 0.74);
    const leafLight = mix(leaf, 0xd8e88a, 0.3);

    groundShadow(b, 32, 79, 19);

    // Tronco: alarga para baixo e termina em raízes que agarram o chão.
    for (let y = 40; y < 78; y++) {
      const spread = Math.round(((y - 40) / 38) ** 2 * 6);
      b.rect(28 - spread, y, 8 + spread * 2, 1, bark);
      b.rect(28 - spread, y, 2, 1, barkLight);
      b.rect(34 + spread - 1, y, 1, 1, barkDark);
    }
    // Raízes espalhadas na terra, o que planta a árvore no lugar.
    for (const [dx, len] of [
      [-1, 9],
      [1, 9],
      [-1, 5],
      [1, 6],
    ] as const) {
      let x = 32 + dx * 5;
      let y = 74;
      for (let i = 0; i < len; i++) {
        x += dx;
        y += i % 2 === 0 ? 1 : 0;
        b.set(x, y, shade(bark, 0.85));
        b.set(x, y + 1, barkDark);
      }
    }
    // Textura de casca: estrias verticais irregulares.
    for (let i = 0; i < 26; i++) {
      const x = 29 + rng.int(6);
      const y = 44 + rng.int(30);
      b.set(x, y, barkDark);
      b.set(x, y + 1, barkDark);
    }

    // Galhos saindo do tronco para dentro da copa.
    for (const [dx, dy, len] of [
      [-1, -1, 11],
      [1, -1, 11],
      [-1, -1, 6],
      [1, -1, 5],
    ] as const) {
      let bx = 32;
      let by = 46;
      for (let i = 0; i < len; i++) {
        bx += dx;
        by += dy;
        b.set(bx, by, bark);
        b.set(bx, by + 1, barkDark);
      }
    }

    // Copa em cinco volumes: base larga e escura, laterais, e um topo claro
    // onde o sol bate. É a sobreposição dos discos que dá a silhueta fofa —
    // um disco só vira pirulito.
    b.disc(32, 33, 19, leafDark);
    b.disc(18, 28, 13, shade(leaf, 0.86));
    b.disc(46, 29, 13, shade(leaf, 0.86));
    b.disc(32, 26, 18, leaf);
    b.disc(26, 18, 12, leafLight);
    b.disc(40, 20, 10, mix(leaf, leafLight, 0.6));
    // Folhas soltas na borda: contorno irregular, sem "bolha".
    for (let i = 0; i < 46; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = 17 + rng.range(0, 3.5);
      b.set(
        32 + Math.cos(angle) * radius,
        30 + Math.sin(angle) * radius * 0.92,
        rng.chance(0.5) ? leaf : leafDark,
      );
    }
    for (let i = 0; i < 34; i++) {
      b.set(15 + rng.int(35), 10 + rng.int(28), mix(leaf, 0xffffff, 0.22));
    }

    if (decor === 'flowers') {
      const petal = 0xf2b8d0;
      for (let i = 0; i < 34; i++) {
        const angle = rng.range(0, Math.PI * 2);
        const radius = rng.range(0, 16);
        b.disc(32 + Math.cos(angle) * radius, 28 + Math.sin(angle) * radius * 0.95, 1.5, petal);
      }
      b.disc(24, 18, 2, mix(petal, 0xffffff, 0.5));
      b.disc(41, 24, 1.8, mix(petal, 0xffffff, 0.4));
    } else if (decor === 'fruit') {
      // Maçãs maduras nos galhos, antes de caírem. São elas que anunciam de
      // longe onde há comida no jardim.
      for (let i = 0; i < 11; i++) {
        const angle = rng.range(0, Math.PI * 2);
        const radius = rng.range(4, 16);
        const fx = 32 + Math.cos(angle) * radius;
        const fy = 28 + Math.sin(angle) * radius * 0.95;
        b.disc(fx, fy, 3, 0x8f2822);
        b.disc(fx, fy - 0.4, 2.4, 0xd6473f);
        b.disc(fx - 0.9, fy - 1, 1, 0xef7a72);
      }
    } else if (decor === 'nest') {
      const straw = 0xa8814a;
      b.ellipse(43, 20, 6.5, 4, shade(straw, 0.78));
      b.ellipse(43, 18.8, 5.6, 3.2, straw);
      b.ellipse(43, 19, 3.6, 1.8, shade(straw, 0.62));
      for (let i = 0; i < 10; i++) b.set(38 + rng.int(11), 16 + rng.int(6), shade(straw, 0.9));
      // Ovinhos.
      b.ellipse(41.5, 18.6, 1.4, 1.1, 0xeaf0f5);
      b.ellipse(44.5, 18.6, 1.4, 1.1, 0xeaf0f5);
    }

    return b.toTexture();
  };

  /**
   * Pedra: uma massa pesada com face iluminada em cima e sombra funda embaixo.
   * Precisa parecer que custa a empurrar, porque agora ela se empurra mesmo.
   */
  const rock = (variant: number): Texture => {
    const b = new PixelBuffer(52, 44);
    const stone = variant === 0 ? 0x8d8f95 : 0x9a958c;
    groundShadow(b, 26, 39, 17);

    b.ellipse(26, 26, 18, 12, shade(stone, 0.58));
    b.ellipse(26, 23, 17.5, 11.5, shade(stone, 0.8));
    b.ellipse(25, 20, 15, 9.5, stone);
    b.ellipse(22, 16, 10, 6, mix(stone, 0xffffff, 0.2));
    b.ellipse(19, 13, 5.5, 3.2, mix(stone, 0xffffff, 0.36));

    // Facetas: duas rachaduras retas transformam a bolha em rocha.
    for (let i = 0; i < 13; i++) b.set(30 + i * 0.5, 16 + i, shade(stone, 0.5));
    for (let i = 0; i < 8; i++) b.set(31 + i, 24 + i * 0.3, shade(stone, 0.5));
    for (let i = 0; i < 9; i++) b.set(14 + i * 0.4, 22 + i, shade(stone, 0.62));

    // Musgo no pé, do lado da sombra: pedra de jardim, não bola de boliche.
    b.ellipse(34, 30, 5, 2.6, 0x6f9a5e);
    b.ellipse(15, 29, 4, 2.2, 0x6f9a5e);
    for (let i = 0; i < 14; i++) {
      b.set(10 + rng.int(33), 26 + rng.int(7), rng.chance(0.5) ? 0x7fac6a : shade(stone, 0.66));
    }
    return b.toTexture();
  };

  const bush = (variant: number): Texture => {
    const b = new PixelBuffer(46, 34);
    const green = variant === 0 ? 0x4e8c3f : 0x568f4a;
    groundShadow(b, 23, 30, 15);
    b.disc(13, 21, 9, shade(green, 0.8));
    b.disc(33, 21, 9, shade(green, 0.8));
    b.disc(23, 20, 11, shade(green, 0.9));
    b.disc(19, 14, 8, green);
    b.disc(29, 15, 7, mix(green, 0xd8e88a, 0.2));
    for (let i = 0; i < 26; i++) {
      b.set(8 + rng.int(31), 6 + rng.int(20), mix(green, 0xffffff, 0.2));
    }
    // Frutinhas: é onde as criaturas vão procurar quando ninguém está olhando.
    for (let i = 0; i < 5; i++) {
      b.disc(11 + rng.int(25), 12 + rng.int(13), 1.6, 0x8f2822);
      b.set(11 + rng.int(25), 12 + rng.int(13), 0xd6473f);
    }
    return b.toTexture();
  };

  return {
    tree: [tree('plain'), tree('flowers'), tree('fruit'), tree('nest')],
    rock: [rock(0), rock(1)],
    bush: [bush(0), bush(1)],
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
