import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  COURT_FILLERS_TEST,
  FILLER_SETS,
  POSE_CLIP,
  STATES,
  type CreatureSignals,
  type StateName,
} from './states';

/**
 * QUANTAS DAS TIRAS DO ARTISTA ESTÃO REALMENTE NA TELA.
 *
 * O jogador perguntou, e a pergunta era boa: "você colocou todas que mandei?".
 * A resposta era não — cento e dezenove das duzentas e vinte e três nunca
 * apareceram —, e ninguém tinha como saber, porque não havia onde olhar. Os
 * testes existentes cobriam o outro sentido: que toda tira PEDIDA existe na
 * pasta. O contrário — que toda tira da pasta é pedida por alguém — não era
 * cobrado por ninguém.
 *
 * Este teste é o inventário. Ele não obriga o jogo a usar tudo: há tiras que
 * dependem de coisas que ainda não acontecem no jardim (chocar um ovo, um bicho
 * envelhecendo à vista) e há tiras que não podem ser usadas como estão (o
 * objeto desenhado encosta no corpo e não sai no recorte). O que ele obriga é
 * que o número não caia sem alguém reparar, e que a lista do que falta esteja
 * escrita em algum lugar em vez de existir só na pasta.
 */

const ANIM_DIR = 'src/assets/creatures/animations';

/** Todas as chaves da pasta, agrupadas por categoria. */
function folder(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const dir of readdirSync(ANIM_DIR)) {
    const path = join(ANIM_DIR, dir);
    if (!statSync(path).isDirectory()) continue;
    out.set(
      dir,
      readdirSync(path)
        .filter((f) => f.endsWith('.png'))
        .map((f) => f.split('--')[1] ?? ''),
    );
  }
  return out;
}

const base: CreatureSignals = {
  intent: 'wander',
  pose: 0,
  mood: 0,
  moving: false,
  speed: 0,
  carrying: false,
  ball: false,
  scar: 0,
  fear: 0,
  happiness: 0.5,
  energy: 1,
  health: 1,
  touched: false,
  carried: false,
  lift: 0,
  isBaby: false,
  company: 0,
  routine: 0,
};

/**
 * Toda chave que o jogo pode chegar a mostrar.
 *
 * Três caminhos, e os três contam: o laço de um estado, a travessia de entrada,
 * e as microanimações que entram por cima do laço.
 */
function reachable(): Set<string> {
  const keys = new Set<string>();
  const froms: Array<StateName | null> = [null, 'Run', 'Sleep', 'Trauma', 'Sit', 'Idle', 'Curious'];
  const intents = [
    'wander',
    'seekFood',
    'seekWater',
    'sleep',
    'play',
    'study',
    'socialize',
    'follow',
    'mate',
    'search',
    'watch',
    'attack',
    'flee',
    'shelter',
    'sunbathe',
    'share',
    'approachPlayer',
  ] as const;

  const push = (s: CreatureSignals): void => {
    for (const rule of STATES) {
      if (!rule.when(s)) continue;
      keys.add(rule.clip(s));
      for (const from of froms) {
        const enter = rule.enter?.(s, from);
        if (enter) keys.add(enter);
      }
      for (const filler of rule.fillers ?? []) keys.add(filler);
      break;
    }
  };

  for (const intent of intents) {
    for (const moving of [false, true]) {
      for (const isBaby of [false, true]) {
        for (const ball of [false, true]) {
          for (let company = 0; company <= 4; company++) {
            for (const happiness of [0.05, 0.5, 0.95]) {
              push({ ...base, intent, moving, isBaby, ball, company, happiness, carrying: false });
            }
          }
        }
      }
    }
  }
  for (let mood = 0; mood <= 12; mood++)
    for (const happiness of [0.05, 0.5, 0.95]) push({ ...base, mood, happiness });
  for (const pose of Object.keys(POSE_CLIP).map(Number)) push({ ...base, pose });
  for (let routine = 0; routine <= 5; routine++)
    for (let company = 0; company <= 4; company++) push({ ...base, routine, company });
  for (const extra of [
    { health: 0 },
    { health: 0.2 },
    { health: 0.2, moving: true },
    { scar: 0.6, fear: 0.7 },
    { scar: 0.6, fear: 0.7, moving: true },
    { fear: 0.9 },
    { fear: 0.9, moving: true, isBaby: true },
    { touched: true },
    // Carinho em quem carrega cicatriz é outra cena, e sem esta combinação a
    // varredura não chegava lá.
    { touched: true, scar: 0.6 },
    { carrying: true },
    { carried: true },
    { carried: true, fear: 0.9 },
    { moving: true, speed: 80 },
  ]) {
    push({ ...base, ...extra });
  }
  // As microanimações não dependem de sinal: elas são o repertório do estado.
  for (const set of FILLER_SETS) for (const key of set) keys.add(key);
  // E as três que o gesto do jogador dispara direto, sem passar pela tabela: o
  // tapa, a palavra ouvida, a fruta cheirada.
  for (const key of ['tapa', 'ouvirPalavra', 'cheirarComida']) keys.add(key);
  return keys;
}

describe('o inventário das animações', () => {
  const categorias = folder();
  const todas = [...categorias.values()].flat();
  const vistas = reachable();

  it('quantas das tiras do artista chegam à tela, categoria por categoria', () => {
    const linhas: string[] = [];
    let usadas = 0;
    for (const [categoria, chaves] of categorias) {
      const dentro = chaves.filter((k) => vistas.has(k));
      usadas += dentro.length;
      const fora = chaves.filter((k) => !vistas.has(k));
      linhas.push(
        `${categoria.padEnd(18)} ${String(dentro.length).padStart(2)}/${chaves.length}` +
          (fora.length ? `   falta: ${fora.join(' ')}` : '   — completa'),
      );
    }
    console.log(`\n${linhas.join('\n')}\n${usadas} de ${todas.length} tiras aparecem no jogo`);

    // O PISO. Não é uma meta: é uma catraca. Ele sobe quando alguém liga uma
    // tira nova e nunca desce sozinho — se descer, é porque um estado foi
    // removido ou um nome foi trocado, e isso tem de doer aqui e não no jardim.
    expect(usadas, 'alguma tira que já aparecia parou de aparecer').toBeGreaterThanOrEqual(130);
  });

  it('e o convívio é a metade que mais importa: ninguém brinca sozinho num jardim cheio', () => {
    const convivio = [
      ...(categorias.get('08-social') ?? []),
      ...(categorias.get('09-reproducao') ?? []),
    ];
    const dentro = convivio.filter((k) => vistas.has(k));
    console.log(`convívio: ${dentro.length}/${convivio.length} — ${dentro.sort().join(' ')}`);
    // Eram seis de trinta e três quando o jogador reclamou que "eles meio que
    // não interagem muito". Ele estava certo, e dava para medir.
    expect(dentro.length, 'o convívio encolheu').toBeGreaterThanOrEqual(13);
  });

  it('nenhuma tira pedida deixou de existir na pasta', () => {
    const inexistentes = [...vistas].filter((k) => !todas.includes(k));
    expect(inexistentes, `a tabela pede tiras que não estão na pasta`).toEqual([]);
  });

  it('e as travessias de cortejo continuam desenhadas', () => {
    expect(COURT_FILLERS_TEST.filter((k) => !todas.includes(k))).toEqual([]);
  });
});
