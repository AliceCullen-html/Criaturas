import { ICON_COUNT } from '@core';
import iconsUrl from '../assets/ui/icons.png';

/**
 * O CURSOR VIRA A FERRAMENTA.
 *
 * Não existe seta do navegador dentro do jardim. O que se vê é o objeto que
 * está na mão — a maçã, a esponja, o livro, o ovo — e é ele que encosta nas
 * coisas. É a diferença entre "apontar para a criatura e clicar" e "levar a
 * maçã até a boca dela".
 *
 * O recorte é feito uma vez, na abertura: o atlas vem em 4× (células de 64), e
 * cada ícone é reduzido ao desenho original de 16×16 e depois ampliado a 32×32
 * sem suavização — que é o tamanho que o sistema operacional aceita como cursor
 * sem borrar. O ponto quente fica no CENTRO, como manda a ficha da arte: o que
 * toca a criatura é o meio da maçã, não a quina de uma seta invisível.
 */

/** Lado da célula no atlas em 4×. */
const CELL = 64;
/** Lado do desenho de verdade. */
const ART = 16;
/** Lado do cursor na tela: o dobro do desenho, que é o que não borra. */
const CURSOR = 32;
const COLS = 8;

let cache: string[] | null = null;

/** Recorta o atlas em quinze cursores. Devolve `cursor:` prontos para o CSS. */
export async function loadToolCursors(): Promise<string[]> {
  if (cache) return cache;

  const image = new Image();
  image.src = iconsUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = CURSOR;
  canvas.height = CURSOR;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.imageSmoothingEnabled = false;

  const out: string[] = [];
  for (let i = 0; i < ICON_COUNT; i++) {
    ctx.clearRect(0, 0, CURSOR, CURSOR);
    ctx.drawImage(
      image,
      (i % COLS) * CELL,
      Math.floor(i / COLS) * CELL,
      CELL,
      CELL,
      0,
      0,
      CURSOR,
      CURSOR,
    );
    // O ponto quente no meio: é o objeto que encosta, não a ponta de nada.
    out.push(`url(${canvas.toDataURL('image/png')}) ${CURSOR / 2} ${CURSOR / 2}, auto`);
  }
  cache = out;
  return out;
}

/** Ícone do atlas como URL solta — para o cinto e para quem mais precisar. */
export { iconsUrl };
export const ICON_CELL = CELL;
export const ICON_ART = ART;
export const ICON_COLS = COLS;
