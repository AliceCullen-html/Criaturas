import { describe, it, expect } from 'vitest';
import { catalogKeys } from './clipCatalog';
import { IDLE_FILLERS, POSE_CLIP, STATES, type CreatureSignals, type StateName } from './states';

/**
 * A MÁQUINA DE ESTADOS CONTRA A PASTA DE VERDADE.
 *
 * Todo o sistema se apoia num acordo por NOME: a tabela pede `espreguicar` e
 * na pasta existe um `espreguicar--...png`. Um erro de digitação aqui não
 * quebra nada — a criatura simplesmente cai no ocioso e fica lá, parecendo
 * viva mas sem nunca fazer o que deveria. É o pior tipo de defeito: silencioso.
 *
 * Este teste varre a tabela com todas as combinações de sinais que importam,
 * junta TODA chave que ela pode chegar a pedir, e confere uma por uma contra os
 * arquivos que existem na pasta. Ele é o que permite acrescentar estado novo
 * sem medo — e o que vai apitar no dia em que alguém renomear um PNG.
 */

const base: CreatureSignals = {
  intent: 'wander',
  pose: 0,
  mood: 0,
  moving: false,
  speed: 0,
  carrying: false,
  scar: 0,
  fear: 0,
  happiness: 0.5,
  energy: 1,
  health: 1,
  touched: false,
  carried: false,
  isBaby: false,
};

/** Todo sinal que muda alguma escolha da tabela, variado um a um. */
function everySignal(): CreatureSignals[] {
  const out: CreatureSignals[] = [];
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
  ] as const;
  for (const intent of intents) {
    for (const moving of [false, true]) {
      for (const isBaby of [false, true]) {
        for (const happiness of [0.05, 0.5, 0.95]) {
          out.push({ ...base, intent, moving, isBaby, happiness, speed: moving ? 30 : 0 });
        }
      }
    }
  }
  for (let mood = 0; mood <= 12; mood++) {
    out.push({ ...base, mood });
    out.push({ ...base, mood, happiness: 0.05 });
    out.push({ ...base, mood, happiness: 0.95 });
  }
  for (const pose of Object.keys(POSE_CLIP).map(Number)) out.push({ ...base, pose });
  out.push(
    { ...base, pose: 19 },
    { ...base, pose: 20 },
    { ...base, pose: 3 },
    { ...base, pose: 4 },
  );
  out.push(
    { ...base, health: 0 },
    { ...base, health: 0.2 },
    { ...base, health: 0.2, moving: true },
  );
  out.push({ ...base, scar: 0.6, fear: 0.7 }, { ...base, scar: 0.6, fear: 0.7, moving: true });
  out.push({ ...base, fear: 0.9 }, { ...base, fear: 0.9, moving: true, isBaby: true });
  out.push({ ...base, touched: true }, { ...base, carrying: true });
  out.push(
    { ...base, carried: true },
    { ...base, carried: true, fear: 0.9 },
    { ...base, carried: true, scar: 0.5 },
  );
  out.push({ ...base, moving: true, speed: 80 });
  return out;
}

/** Toda chave que a tabela pode pedir, laço e travessia. */
function everyClip(): Set<string> {
  const keys = new Set<string>();
  const froms: Array<StateName | null> = [null, 'Run', 'Sleep', 'Trauma', 'Sit', 'Idle'];
  for (const signals of everySignal()) {
    for (const rule of STATES) {
      if (!rule.when(signals)) continue;
      keys.add(rule.clip(signals));
      for (const from of froms) {
        const enter = rule.enter?.(signals, from);
        if (enter) keys.add(enter);
      }
      break;
    }
  }
  return keys;
}

describe('a tabela e a pasta falam a mesma língua', () => {
  const existing = new Set(catalogKeys());

  it('a pasta tem as duzentas e tantas animações', () => {
    expect(existing.size).toBeGreaterThan(200);
  });

  it('toda animação que a máquina de estados pede existe na pasta', () => {
    const pedidas = [...everyClip()].sort();
    expect(pedidas.length).toBeGreaterThan(25);
    expect(pedidas.filter((key) => !existing.has(key))).toEqual([]);
  });

  it('toda microanimação do ocioso existe', () => {
    expect(IDLE_FILLERS.filter((key) => !existing.has(key))).toEqual([]);
  });

  it('e todo microcomportamento da simulação tem desenho', () => {
    expect(Object.values(POSE_CLIP).filter((key) => !existing.has(key))).toEqual([]);
  });
});
