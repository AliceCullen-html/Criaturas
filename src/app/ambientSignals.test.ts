import { describe, it, expect } from 'vitest';
import { AmbientVoice, ambientKindFor, AMBIENT_QUIET } from './ambientSignals';

/**
 * A INTERROGAÇÃO INFINITA.
 *
 * O jogador viu antes de qualquer teste: "não parece vivo ainda, ele já nasce
 * com uma interrogação infinita subindo na cabeça". Era verdade, e o caminho
 * até lá tinha duas pernas que só se somam no jardim de verdade — o rodízio que
 * degenera quando há UMA criatura, e um espaçamento de meio segundo que era
 * certo para a esponja e errado para um pensamento.
 *
 * Este teste roda a cadência de verdade: seis chamadas por segundo, que é o que
 * o jogo faz, e conta os balões.
 */

/** Chamadas por segundo, como no jogo: uma a cada dez quadros de sessenta. */
const RATE = 6;

/** Um sorteio previsível, para o teste medir cadência e não sorte. */
const cycled = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

/** Quantos balões saem de um jardim em um minuto. */
function minuteOf(population: number, quiet = AMBIENT_QUIET): number {
  const voice = new AmbientVoice(quiet, cycled([0.1, 0.9, 0.5, 0.3, 0.7]));
  let cursor = 0;
  let spoken = 0;
  for (let call = 0; call < RATE * 60; call++) {
    const picked = cursor % population;
    cursor += 1;
    if (voice.speak(picked, call / RATE)) spoken += 1;
  }
  return spoken;
}

describe('os balões espontâneos', () => {
  it('uma criatura sozinha não fica com um símbolo eterno na cabeça', () => {
    // O JARDIM COMO O JOGO COMEÇA: uma criatura, e o rodízio de população
    // escolhendo sempre ela. Foi este caso que o jogador viu.
    const balões = minuteOf(1);
    // O espaçamento antigo, medido no mesmo banco, para o número ter tamanho:
    // era o meio segundo da esponja servindo de silêncio para um pensamento.
    const antes = minuteOf(1, 0.5);
    console.log(`uma criatura: ${balões} balões por minuto — com o antigo eram ${antes}`);
    expect(antes, 'o espaçamento antigo não era o problema que se pensava').toBeGreaterThan(100);

    // Antes: um a cada meio segundo, cento e vinte por minuto, e como cada
    // símbolo vive um segundo e meio havia três no ar o tempo todo.
    expect(balões, 'ainda sai um símbolo atrás do outro').toBeLessThan(10);
    // Mas ela não pode ficar MUDA: o balão é como o jardim se explica.
    expect(balões, 'a criatura emudeceu').toBeGreaterThan(2);

    // E nunca dois no ar ao mesmo tempo: o símbolo vive 1,4s.
    expect(60 / balões, 'dois balões da mesma criatura se cruzam').toBeGreaterThan(1.4);
  });

  it('e num jardim cheio cada uma continua tendo a vez dela', () => {
    // O outro lado: o silêncio não pode calar o jardim inteiro. Com sessenta
    // criaturas o rodízio já espaça sozinho — uma vez a cada dez segundos —, e
    // o relógio de cada uma não deve tirar mais nada.
    const balões = minuteOf(60);
    const porCriatura = balões / 60;
    console.log(
      `sessenta criaturas: ${balões} balões por minuto no jardim todo · ` +
        `${porCriatura.toFixed(1)} por criatura`,
    );
    expect(balões, 'o jardim ficou mudo').toBeGreaterThan(20);
    // E o teto é o MESMO de quem está sozinha: nenhuma criatura fala mais de
    // seis vezes por minuto, esteja o jardim cheio ou vazio. É esta a garantia
    // que faltava — antes, quanto menor a população, mais barulhenta cada uma.
    expect(porCriatura, 'alguém falando demais num jardim cheio').toBeLessThan(6);
  });

  it('o silêncio é sorteado — um balão não bate como metrônomo', () => {
    const voice = new AmbientVoice(AMBIENT_QUIET, cycled([0, 1, 0.25, 0.75]));
    const quando: number[] = [];
    for (let call = 0; call < RATE * 120; call++) {
      const now = call / RATE;
      if (voice.speak(1, now)) quando.push(now);
    }
    const intervalos = quando.slice(1).map((t, i) => t - quando[i]!);
    const menor = Math.min(...intervalos);
    const maior = Math.max(...intervalos);
    console.log(`intervalos entre ${menor.toFixed(1)}s e ${maior.toFixed(1)}s`);
    expect(maior - menor, 'todos os balões saem no mesmo compasso').toBeGreaterThan(2);
  });

  it('o que ela mostra sai do que ela está sentindo, na ordem da urgência', () => {
    const calma = { intent: 'wander', affection: 0, attention: 0, anger: 0, happiness: 0.2 };
    expect(ambientKindFor(calma), 'balão sem motivo nenhum').toBeNull();

    expect(ambientKindFor({ ...calma, intent: 'seekWater' })).toBe('drop');
    expect(ambientKindFor({ ...calma, intent: 'sleep' })).toBe('sleep');
    expect(ambientKindFor({ ...calma, affection: 0.5 })).toBe('heart');
    expect(ambientKindFor({ ...calma, anger: 0.8 })).toBe('anger');
    expect(ambientKindFor({ ...calma, attention: 1 })).toBe('question');
    expect(ambientKindFor({ ...calma, happiness: 0.9 })).toBe('heart');

    // A sede vence o carinho: um corpo apertado fala mais alto que um humor.
    expect(ambientKindFor({ ...calma, intent: 'seekWater', affection: 1 })).toBe('drop');
  });

  it('esquece o silêncio de quem morreu', () => {
    const voice = new AmbientVoice();
    for (let entity = 0; entity < 40; entity++) voice.speak(entity, 0);
    expect(voice.size).toBe(40);
    voice.forget((entity) => entity < 5);
    expect(voice.size, 'guardou o silêncio de quem já morreu').toBe(5);
  });
});
