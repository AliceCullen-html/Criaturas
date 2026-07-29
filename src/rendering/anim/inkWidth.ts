/**
 * A LARGURA DA TINTA DE UMA TIRA — medida no arquivo, em Node.
 *
 * Existe para o teste, e por isso não usa nada do navegador: lê o PNG do disco
 * e o descomprime com o `zlib` que já vem no Node. São sessenta linhas de
 * decodificador, e elas se pagam: é com esta medida que `clips.test.ts` sabe
 * que `brincarSozinho` tem uma bola dentro e `idle` não tem nada — sem que
 * ninguém precise manter uma lista escrita à mão que envelhece no primeiro dia
 * em que o artista mandar sprites novos.
 *
 * O corpo da criatura ocupa 48 pixels de largura em TODAS as 223 tiras. Um
 * quadro mais largo que isso tem outra coisa dentro dele.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Largura do corpo da criatura na arte, medida em todas as tiras. */
export const BODY_INK_WIDTH = 48;
/**
 * O quanto uma marca de quadrinho pode passar disso.
 *
 * Coração, balão, gota de suor, risco de velocidade e o "Z" do sono são
 * linguagem, não objeto — e cabem nesta folga. Uma bola, um presente ou um
 * amigo não cabem.
 */
export const MARK_SLACK = 24;

interface Decoded {
  width: number;
  height: number;
  channels: number;
  data: Buffer;
}

function decodePng(path: string): Decoded {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 8;
  const chunks: Buffer[] = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') break;
    pos += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`${path}: profundidade ${bitDepth} não suportada`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`${path}: cor tipo ${colorType} não suportada`);

  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]!;
    const line = raw.subarray(p, p + stride);
    p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      const x = line[i]!;
      let v: number;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else {
        const guess = a + b - c;
        const da = Math.abs(guess - a);
        const db = Math.abs(guess - b);
        const dc = Math.abs(guess - c);
        v = x + (da <= db && da <= dc ? a : db <= dc ? b : c);
      }
      cur[i] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/** A maior largura de tinta entre os quadros da tira, em pixels da arte. */
export function widestInk(path: string, frameWidth: number, gutter: number): number {
  const { width, height, channels, data } = decodePng(path);
  const count = Math.round((width + gutter) / (frameWidth + gutter));
  let widest = 0;
  for (let f = 0; f < count; f++) {
    const x0 = f * (frameWidth + gutter);
    let minX = Infinity;
    let maxX = -1;
    for (let x = 0; x < frameWidth; x++) {
      for (let y = 0; y < height; y++) {
        const i = (y * width + x0 + x) * channels;
        const alpha = channels === 4 ? data[i + 3]! : channels === 2 ? data[i + 1]! : 255;
        if (alpha > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          break;
        }
      }
    }
    if (maxX >= 0) widest = Math.max(widest, maxX - minX + 1);
  }
  return widest;
}
