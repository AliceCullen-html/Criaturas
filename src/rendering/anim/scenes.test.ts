import { describe, it, expect } from 'vitest';
import { MOOD } from '@core';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BODY_INK_WIDTH, alphaReader, widestInk } from './inkWidth';
import { FRAME_H, FRAME_W, bodyCut } from './clipCatalog';
import {
  IDLE_FILLERS,
  POSE_CLIP,
  PROP_IN_THE_WORLD,
  STATES,
  type CreatureSignals,
  type StateName,
} from './states';

/**
 * A CRIATURA SOZINHA TEM DE ESTAR SOZINHA NO DESENHO.
 *
 * O artista não desenhou poses: desenhou CENAS. `brincarSozinho` tem uma bola
 * dentro, `investigar` tem um presente, `observar` tem uma flor, `assustar` tem
 * a mão do jogador. Usar qualquer uma delas num estado em que aquilo não existe
 * põe na tela um objeto que o jogador não pode pegar — e ele TENTA. Foi o que
 * aconteceu três vezes: o ovo virou uma criatura chocando, o humor brincalhão
 * virou uma bola que ninguém deu, e o susto virou uma mão que não estava lá.
 *
 * Este teste mede a tinta de cada tira, no arquivo. Não há lista escrita de
 * "quais têm bola": o corpo da criatura ocupa 48 pixels em todas as 223, e o
 * que passa disso é outra coisa dentro do quadro. Uma tira larga usada num
 * estado solitário reprova — e o remédio é olhar para ela e decidir: se for só
 * uma MARCA (coração, balão, "Z"), entra na lista de exceções abaixo, com o
 * nome de quem olhou implícito no commit; se for um objeto, não serve para
 * aquele estado.
 */

const ANIMATIONS = fileURLToPath(new URL('../../assets/creatures/animations', import.meta.url));
const GUTTER = 16;

/**
 * TIRAS LARGAS QUE SÃO SÓ MARCA.
 *
 * Cada uma foi aberta e olhada. Coração, balão de pensamento e o "Z" do sono
 * são linguagem de quadrinho: ninguém tenta pegar um coração do chão. Objetos
 * do jardim — bola, presente, flor, fruta, amigo, mão — não entram aqui nunca.
 */
const MARKS_ONLY = new Set([
  'muitoFeliz', // um coração grande
  'carinhoso', // um coração e a lembrança de alguém, esmaecida
  'pensar', // balão de pensamento
  'pedir', // balão de pedido
  'pedirAgua', // idem
  'dormir', // os "Z"
  'filhoteDorme', // idem
  'medo', // riscos de tremor
  'chorarT', // lágrimas
  'comemorar', // estrelas
  'tremer', // riscos de tremor
  'congelar', // riscos
  'espreguicar', // o estalo do alongamento
  'morte', // a alma subindo
  'fugir', // riscos de velocidade
  'panico', // riscos
  'filhoteFoge', // riscos
  'filhoteChora', // lágrimas
  'estressado',
  'ansioso',
  'orgulhoso',
  'irritado',
  'solitario',
  'triste',
  'descansar',
  'febre',
  'recuperando',
  'acordar',
  'desmaiar',
  'morrendo',
  'escorregar',
  'rolar',
  'cair',
  'levantarQueda',
  'escalar',
  'frear',
  'sentar',
  'cocar',
  'farejar',
  'curioso',
  'confuso',
  'surpreso',
  'olharLados',
  'caminhar',
  'correr',
  'nadar',
  'flutuar',
  'doente',
  'filhoteExplora', // um pontinho de interrogação sobre a cabeça
  'cairMao', // riscos da queda
]);

/** Caminho do PNG de cada animação, varrendo a pasta como o jogo faz. */
function files(): Map<string, string> {
  const out = new Map<string, string>();
  for (const dir of readdirSync(ANIMATIONS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of readdirSync(`${ANIMATIONS}/${dir.name}`)) {
      if (!file.endsWith('.png')) continue;
      const key = file.split('--')[1];
      if (key) out.set(key, `${ANIMATIONS}/${dir.name}/${file}`);
    }
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
};

/** Toda animação que uma regra SEM objeto garantido pode pedir. */
function soloClips(): Set<string> {
  const keys = new Set<string>();
  const froms: Array<StateName | null> = [null, 'Run', 'Sleep', 'Trauma', 'Sit', 'Idle'];
  const variations: CreatureSignals[] = [];
  for (const moving of [false, true]) {
    for (const isBaby of [false, true]) {
      for (let mood = 0; mood <= 12; mood++) {
        for (const happiness of [0.05, 0.5, 0.95]) {
          variations.push({ ...base, moving, isBaby, mood, happiness, speed: moving ? 30 : 0 });
        }
      }
    }
  }
  for (const pose of Object.keys(POSE_CLIP).map(Number)) variations.push({ ...base, pose });
  variations.push(
    { ...base, health: 0 },
    { ...base, health: 0.2 },
    { ...base, health: 0.2, moving: true },
    { ...base, fear: 0.9 },
    { ...base, fear: 0.9, moving: true },
    { ...base, fear: 0.9, isBaby: true },
    { ...base, fear: 0.9, isBaby: true, moving: true },
    { ...base, scar: 0.6, fear: 0.7 },
    { ...base, scar: 0.6, fear: 0.7, moving: true },
    { ...base, intent: 'search' },
    { ...base, intent: 'watch' },
    // BRINCAR SEM BOLA. A intenção é a mesma para brincar com a bola, com um
    // amigo, com a mão do jogador e com a chuva — e só a primeira tem bola.
    // Sem `ball`, brincar é um estado de criatura sozinha como qualquer outro,
    // e a medida de tinta abaixo cobra isso.
    { ...base, intent: 'play' },
    { ...base, intent: 'play', isBaby: true },
    { ...base, intent: 'play', moving: true, speed: 30 },
    { ...base, intent: 'play', isBaby: true, mood: MOOD.playful },
    { ...base, intent: 'sleep' },
    { ...base, intent: 'sleep', isBaby: true },
    { ...base, moving: true, speed: 80 },
    { ...base, lift: 12 },
  );

  for (const signals of variations) {
    for (const rule of STATES) {
      if (!rule.when(signals)) continue;
      // Regras que GARANTEM o objeto ficam de fora: nelas a cena é verdade.
      if (!rule.withProp) {
        keys.add(rule.clip(signals));
        for (const from of froms) {
          const enter = rule.enter?.(signals, from);
          if (enter) keys.add(enter);
        }
      }
      break;
    }
  }
  for (const key of IDLE_FILLERS) keys.add(key);
  for (const key of Object.values(POSE_CLIP)) keys.add(key);
  // As microanimações de cada estado entram na mesma medida: uma tira pequena
  // que traga um objeto inventado mente igual à tira do laço. Valem as mesmas
  // regras — nos estados que GARANTEM o objeto, a cena é verdade também nas
  // microanimações (a aula diante da máquina é a máquina que está ali).
  for (const rule of STATES) {
    if (rule.withProp) continue;
    for (const key of rule.fillers ?? []) keys.add(key);
  }
  return keys;
}

describe('o desenho não inventa objetos', () => {
  const paths = files();

  it('nenhum estado de criatura sozinha usa uma tira que tem outra coisa dentro', () => {
    const suspeitas: string[] = [];
    for (const key of [...soloClips()].sort()) {
      if (MARKS_ONLY.has(key)) continue;
      const path = paths.get(key);
      expect(path, `a tira ${key} não existe na pasta`).toBeTruthy();
      const largura = widestInk(path!, FRAME_W, GUTTER);
      if (largura > BODY_INK_WIDTH) suspeitas.push(`${key} (${largura}px)`);
    }
    expect(
      suspeitas,
      'estas tiras têm mais que o corpo da criatura dentro — se for só marca, ' +
        'acrescente à lista MARKS_ONLY; se for objeto, o estado precisa de outra tira',
    ).toEqual([]);
  });

  it('brincar sem bola não desenha bola, e com bola desenha', () => {
    // Quatro brincadeiras cabem na intenção `play`: a bola, um amigo, a mão do
    // jogador e a chuva. O filhote que acabou de sair do ovo estava na terceira
    // e apareceu chutando a primeira.
    const semBola = [
      { ...base, intent: 'play' as const },
      { ...base, intent: 'play' as const, isBaby: true },
      { ...base, intent: 'play' as const, moving: true, speed: 30 },
    ];
    for (const signals of semBola) {
      const rule = STATES.find((r) => r.when(signals))!;
      expect(rule.state, 'sem bola no jardim, brincar não é o estado da bola').not.toBe('PlayBall');
      const key = rule.clip(signals);
      if (MARKS_ONLY.has(key)) continue; // marca de quadrinho, já olhada
      expect(
        widestInk(paths.get(key)!, FRAME_W, GUTTER),
        `${key} tem um objeto dentro`,
      ).toBeLessThanOrEqual(BODY_INK_WIDTH);
    }

    // E o contrário: com a bola no chão, a bola aparece.
    const comBola = { ...base, intent: 'play' as const, ball: true };
    const rule = STATES.find((r) => r.when(comBola))!;
    expect(rule.state).toBe('PlayBall');
    expect(widestInk(paths.get(rule.clip(comBola))!, FRAME_W, GUTTER)).toBeGreaterThan(
      BODY_INK_WIDTH,
    );
  });

  /**
   * O RECORTE QUE TIRA O OBJETO DA TIRA.
   *
   * As tiras de brincar trazem uma bola desenhada, e o jardim já desenha a bola
   * dele — com física, sombra e quique. O jogador largou uma bola e viu duas.
   * Agora essas tiras são recortadas na abertura, e este teste roda a MESMA
   * conta de corte que o jogo roda — a função é a mesma, o que muda é de onde
   * vem o alfa (do arquivo aqui, de um canvas lá). Ele cobra três coisas:
   *
   *  - existe corte limpo, isto é, o objeto se separa do corpo em TODO quadro;
   *  - o que fica antes do corte é só a criatura, e ela inteira;
   *  - existe mesmo um objeto depois do corte — senão a tira não tinha o que
   *    perder e não devia estar nesta lista.
   */
  it('as tiras de objeto real perdem o objeto sem perder a criatura', () => {
    // O corpo mede 48 px, e alguns quadros esticam uma pata ou a cauda.
    const CORPO_MAX = BODY_INK_WIDTH + 8;
    for (const key of PROP_IN_THE_WORLD) {
      const path = paths.get(key);
      expect(path, `a tira ${key} não existe na pasta`).toBeTruthy();
      const alpha = alphaReader(path!);
      const quadros = 5;
      const corte = bodyCut(alpha, quadros);
      expect(corte, `${key}: o objeto encosta no corpo, não há corte limpo`).not.toBeNull();

      let objetoCortado = 0;
      for (let f = 0; f < quadros; f++) {
        const x0 = f * (FRAME_W + GUTTER);
        for (let x = corte!; x < FRAME_W; x++) {
          for (let y = 0; y < FRAME_H; y++) if (alpha(x0 + x, y) > 8) objetoCortado += 1;
        }

        // O que FICA tem de ser a criatura, e ela inteira.
        let minX = Infinity;
        let maxX = -1;
        for (let x = 0; x < corte!; x++) {
          for (let y = 0; y < FRAME_H; y++) {
            if (alpha(x0 + x, y) > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              break;
            }
          }
        }
        const largura = maxX - minX + 1;
        expect(largura, `${key} q${f}: sobrou objeto junto com a criatura`).toBeLessThanOrEqual(
          CORPO_MAX,
        );
        expect(largura, `${key} q${f}: o corte comeu a criatura`).toBeGreaterThan(30);
      }
      expect(objetoCortado, `${key}: não havia objeto nenhum para cortar`).toBeGreaterThan(0);
    }
  });

  it('e a lista de exceções não guarda nome que ninguém mais usa', () => {
    const usadas = soloClips();
    const orfas = [...MARKS_ONLY].filter((key) => !usadas.has(key) && !paths.has(key));
    expect(orfas, 'nomes que não existem mais na pasta').toEqual([]);
  });
});
