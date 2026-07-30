import { Rectangle, Texture } from 'pixi.js';

/**
 * O CATÁLOGO DE ANIMAÇÕES.
 *
 * Ninguém escreve aqui a lista do que existe. A pasta É a lista: cada PNG em
 * `assets/creatures/animations/<categoria>/` é uma tira de quadros, e o nome
 * do arquivo diz o resto —
 *
 *     rotulo-legivel--chave--5frames.png
 *
 * Pôr um arquivo novo na pasta certa basta para o jogo passar a conhecer a
 * animação; tirar um arquivo basta para ela sumir. É a única forma de um
 * catálogo com duzentas e tantas animações não virar uma tabela gigante que
 * ninguém mantém — e é o que o briefing pede quando diz que nada pode ficar
 * "hardcoded".
 *
 * A geometria vem da ficha da arte e é UNIFORME: quadro de 38×28 lógicos,
 * exportado em 4× (152×112), com 16 pixels de espaço entre um quadro e o
 * seguinte. Ela é conferida contra a largura real do arquivo — uma tira que
 * não bate com a conta é recusada com o nome dela no erro, em vez de virar
 * uma animação silenciosamente torta.
 */

/** Lado do quadro na arte exportada. */
export const FRAME_W = 152;
export const FRAME_H = 112;
/** Espaço entre um quadro e o seguinte. */
const GUTTER = 16;
/** Quantas vezes a arte foi ampliada em relação ao desenho lógico. */
export const ART_SCALE = 4;

/**
 * ONDE O BICHO ESTÁ DENTRO DO QUADRO.
 *
 * O quadro é largo de propósito: cabe nele a mão do jogador em `afagar`, a
 * pedra em `empurrarPedra`, o amigo em `abracarAmigo`. O CORPO, esse, cai
 * sempre no mesmo lugar — medido em todas as 223 tiras, ele ocupa x[16..63] e
 * y[20..91]. Daí saem a âncora (o umbigo dela, para o espelho não deslocar o
 * corpo) e a altura, que é o que diz a escala e o tamanho do alvo do clique.
 *
 * Medido, não estimado: o desenho não está centrado no quadro, e ancorar no
 * meio deixaria toda criatura um terço de quadro à direita de onde ela está.
 */
export const BODY_CENTER_X = 40;
export const BODY_FOOT_Y = 92;
export const BODY_HEIGHT = 72;
export const ANCHOR_X = BODY_CENTER_X / FRAME_W;
export const ANCHOR_Y = BODY_FOOT_Y / FRAME_H;

/** Uma animação pronta para tocar. */
export interface Clip {
  /** A chave do meio do nome do arquivo: `caminhar`, `olharCima`, `beber`… */
  key: string;
  /** A categoria, que é a pasta: `01-locomocao`, `06-emocoes`… */
  category: string;
  /** O rótulo legível, para o depurador e para o livro do mundo. */
  label: string;
  frames: Texture[];
  /**
   * A âncora horizontal DESTA tira.
   *
   * É `ANCHOR_X` para quase todas. Muda só nas tiras que foram recortadas para
   * perder o objeto desenhado: o quadro ficou mais estreito, e o umbigo da
   * criatura passou a ser uma fração maior dele. Guardar isto por tira é o que
   * mantém o corpo no mesmo lugar da tela depois do corte.
   */
  anchorX: number;
}

/**
 * ONDE CORTAR UMA TIRA PARA ELA PERDER O OBJETO.
 *
 * O quadro tem o corpo à esquerda e o objeto à direita, separados por uma
 * coluna vazia. Aqui a coluna vazia é PROCURADA, quadro a quadro: acha-se o
 * bloco de tinta onde o corpo está (o que contém `BODY_CENTER_X`), e o corte cai
 * no começo do primeiro bloco depois dele — o mais à esquerda entre os quadros,
 * para o mesmo recorte servir para a tira toda.
 *
 * Um recorte por quadro não serviria: o corpo ANDA dentro do quadro ao longo da
 * tira, e é esse andar que faz a animação. Recortando cada quadro no corpo dele,
 * todos ficariam alinhados e o movimento sumiria.
 *
 * Devolve `null` quando o corte não é limpo — quando em algum quadro o objeto
 * encosta no corpo e os dois viram um bloco só. Aí é melhor desenhar a tira
 * inteira e dizer isso em voz alta do que serrar a criatura ao meio.
 */
export function bodyCut(
  alphaAt: (x: number, y: number) => number,
  frameCount: number,
): number | null {
  let cut = FRAME_W;
  let bodyEnd = 0;
  for (let f = 0; f < frameCount; f++) {
    const x0 = f * (FRAME_W + GUTTER);
    const inked: boolean[] = [];
    for (let x = 0; x < FRAME_W; x++) {
      let ink = false;
      for (let y = 0; y < FRAME_H && !ink; y++) if (alphaAt(x0 + x, y) > 8) ink = true;
      inked.push(ink);
    }
    // O bloco onde o corpo está, e o começo do bloco seguinte.
    if (!inked[BODY_CENTER_X]) continue;
    let end = BODY_CENTER_X;
    while (end + 1 < FRAME_W && inked[end + 1]) end += 1;
    bodyEnd = Math.max(bodyEnd, end);
    let next = end + 1;
    while (next < FRAME_W && !inked[next]) next += 1;
    if (next < FRAME_W) cut = Math.min(cut, next);
  }
  return cut > bodyEnd ? cut : null;
}

export type ClipCatalog = ReadonlyMap<string, Clip>;

/**
 * Todos os PNGs das pastas de animação, resolvidos pelo empacotador.
 *
 * `eager: false` não serviria: as texturas são fatiadas na abertura e o jogo
 * não pode descobrir no meio de um passo que a animação de correr ainda está
 * na rede.
 */
const files = import.meta.glob('../../assets/creatures/animations/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Quebra o caminho do arquivo no que ele significa. */
function describe(path: string): { key: string; label: string; category: string } | null {
  const parts = path.split('/');
  const file = parts[parts.length - 1] ?? '';
  const category = parts[parts.length - 2] ?? '';
  const name = file.replace(/\.png$/i, '');
  const pieces = name.split('--');
  if (pieces.length < 2) return null;
  return { label: pieces[0]!.replace(/-/g, ' '), key: pieces[1]!, category };
}

/**
 * Carrega e fatia tudo.
 *
 * Uma textura por ARQUIVO, e os quadros como recortes dela: são duzentas e
 * tantas tiras, e uma textura por quadro seriam mil e cem uploads de GPU na
 * abertura do jogo.
 */
export async function loadClipCatalog(
  bodyOnly: ReadonlySet<string> = new Set(),
): Promise<ClipCatalog> {
  const catalog = new Map<string, Clip>();
  const problems: string[] = [];

  await Promise.all(
    Object.entries(files).map(async ([path, url]) => {
      const what = describe(path);
      if (!what) {
        problems.push(`${path}: nome fora do padrão rotulo--chave--Nframes.png`);
        return;
      }

      const image = new Image();
      image.src = url;
      try {
        await image.decode();
      } catch {
        // UMA TIRA QUE NÃO CARREGA NÃO PODE LEVAR O JARDIM JUNTO.
        //
        // Isto era um `await` solto dentro de um `Promise.all`: bastava um
        // arquivo falhar — rede ruim, cache estranho, um PNG corrompido — para
        // a promessa inteira rejeitar, o `mount` rejeitar junto e o jogo abrir
        // numa tela verde vazia, sem chão, sem árvore, sem nada. Duzentas e
        // vinte e três chances de o jogo não existir.
        problems.push(`${what.key}: o arquivo não carregou (${url})`);
        return;
      }

      // Quantos quadros cabem, pela conta da ficha — e a conta tem de FECHAR.
      const count = Math.round((image.width + GUTTER) / (FRAME_W + GUTTER));
      const expected = count * FRAME_W + (count - 1) * GUTTER;
      if (count < 1 || expected !== image.width || image.height !== FRAME_H) {
        problems.push(
          `${what.key}: tira de ${image.width}×${image.height} não bate com quadros de ` +
            `${FRAME_W}×${FRAME_H} espaçados de ${GUTTER}`,
        );
        return;
      }

      // O CORTE DO OBJETO, quando quem pediu o catálogo diz que esta tira
      // desenha uma coisa que já existe no jardim.
      let width = FRAME_W;
      if (bodyOnly.has(what.key)) {
        const cut = measureCut(image, count);
        if (cut === null) {
          problems.push(`${what.key}: o objeto desenhado encosta no corpo, não dá para recortar`);
        } else {
          width = cut;
        }
      }

      const source = Texture.from(image).source;
      source.scaleMode = 'nearest';
      const frames = Array.from(
        { length: count },
        (_unused, i) =>
          new Texture({
            source,
            frame: new Rectangle(i * (FRAME_W + GUTTER), 0, width, FRAME_H),
          }),
      );
      catalog.set(what.key, {
        key: what.key,
        category: what.category,
        label: what.label,
        frames,
        anchorX: BODY_CENTER_X / width,
      });
    }),
  );

  if (problems.length > 0) {
    // Barulho no console, não exceção: uma tira torta não pode derrubar o
    // jardim inteiro — mas também não pode passar despercebida.
    console.warn(`Animações com problema (${problems.length}):\n  ${problems.join('\n  ')}`);
  }
  return catalog;
}

/** Lê o alfa da tira uma vez e devolve o corte, ou `null` se não houver corte limpo. */
function measureCut(image: HTMLImageElement, count: number): number | null {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  return bodyCut((x, y) => data[(y * image.width + x) * 4 + 3] ?? 0, count);
}

/** Só os nomes, para quem precisa saber o que existe sem carregar nada. */
export function catalogKeys(): string[] {
  return Object.keys(files)
    .map((path) => describe(path)?.key)
    .filter((key): key is string => !!key)
    .sort();
}
