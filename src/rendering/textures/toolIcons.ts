import { ICON_COUNT } from '@core';
import { Rectangle, Texture } from 'pixi.js';
import iconsUrl from '../../assets/ui/icons.png';

/**
 * OS QUINZE ÍCONES DESENHADOS À MÃO.
 *
 * O mesmo atlas serve a três lugares: o cinto (na interface), o cursor (no
 * navegador) e o MUNDO — a bola e os presentes que o jogador larga no chão são
 * estes desenhos, não sprites procedurais. É o que faz um ursinho largado na
 * grama ter a mesma mão que desenhou a criatura.
 *
 * O recorte é o mesmo da folha do Tintim: a arte vem em 4×, é reduzida ao
 * original de 16×16 numa tira única e cada ícone vira um pedaço dessa tira —
 * uma textura só, quinze recortes, um lote de GPU.
 */

const CELL = 64;
const ART = 16;
const COLS = 8;

export async function loadIconTextures(): Promise<Texture[]> {
  const image = new Image();
  image.src = iconsUrl;
  await image.decode();

  const strip = document.createElement('canvas');
  strip.width = ART * ICON_COUNT;
  strip.height = ART;
  const ctx = strip.getContext('2d');
  if (!ctx) throw new Error('Ícones: contexto 2D indisponível.');
  ctx.imageSmoothingEnabled = false;

  for (let i = 0; i < ICON_COUNT; i++) {
    ctx.drawImage(
      image,
      (i % COLS) * CELL,
      Math.floor(i / COLS) * CELL,
      CELL,
      CELL,
      i * ART,
      0,
      ART,
      ART,
    );
  }

  const source = Texture.from(strip).source;
  source.scaleMode = 'nearest';
  return Array.from(
    { length: ICON_COUNT },
    (_unused, i) => new Texture({ source, frame: new Rectangle(i * ART, 0, ART, ART) }),
  );
}
