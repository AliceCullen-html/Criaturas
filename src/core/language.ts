/**
 * A LINGUAGEM.
 *
 * Uma criatura que aprende a dizer "água" não ganhou um enfeite: ganhou um
 * jeito de guardar o mundo dentro da cabeça sem ter o mundo na frente. É essa a
 * diferença entre lembrar de uma coisa e PENSAR nela — e é por isso que a
 * palavra tem efeito de verdade no jogo. Quem sabe a palavra "água" alcança o
 * lago de longe; quem sabe "fruta" repara em comida que os outros não veem;
 * quem sabe "você" conta aos outros o que acha de você.
 *
 * O vocabulário é pequeno e fechado de propósito. Não é um dicionário: é o
 * conjunto de coisas que existem no jardim e que uma criatura pode apontar. Uma
 * palavra sem referente no mundo seria som — e o projeto inteiro se apoia em
 * nada ser decorativo.
 *
 * O aprendizado é por ASSOCIAÇÃO, e por isso é lento: ninguém aprende uma
 * palavra vendo-a uma vez. Ela chega, se repete, e num certo ponto vira
 * conhecimento. Antes desse ponto, esquece-se sozinha.
 */

export const WORD = {
  food: 0,
  water: 1,
  tree: 2,
  rock: 3,
  player: 4,
  friend: 5,
  sleep: 6,
  danger: 7,
  baby: 8,
  home: 9,
} as const;

export type WordId = (typeof WORD)[keyof typeof WORD];

/** Como cada palavra se escreve. É o que aparece na tela do computador. */
export const WORD_TEXT: readonly string[] = [
  'fruta',
  'água',
  'árvore',
  'pedra',
  'você',
  'amigo',
  'dormir',
  'perigo',
  'filhote',
  'casa',
];

export const WORD_COUNT = WORD_TEXT.length;

/**
 * A partir de quanto uma palavra deixa de ser som e passa a ser conhecimento.
 *
 * Abaixo disso ela ainda está sendo aprendida — e some se ninguém repetir.
 * Acima, é para sempre: uma palavra aprendida não se desaprende, mesmo que a
 * criatura passe o resto da vida sem ouvi-la.
 */
export const KNOWN = 0.6;

/**
 * O quanto uma palavra meio aprendida esvanece por segundo.
 *
 * Da ordem do esquecimento da memória associativa (0,0012/s), e por bom motivo:
 * na primeira versão era três vezes maior, e o resultado medido foi que NINGUÉM
 * aprendia nada em vinte e cinco minutos de jardim. As criaturas estudavam aos
 * poucos, saíam para comer e beber, e ao voltarem já haviam perdido o caminho
 * andado. Aprender é intermitente; o esquecimento tem de ser mais lento que os
 * intervalos da vida, senão não existe aprendizado nenhum.
 */
const FADE_PER_SECOND = 0.0008;

export class Lexicon {
  /** Domínio de cada palavra, 0..1, indexado por `WORD`. */
  private readonly grasp = new Float32Array(WORD_COUNT);

  /**
   * Ouve uma palavra. Devolve `true` se foi AGORA que ela virou conhecimento —
   * o instante que merece ir para o livro da história.
   */
  hear(word: number, amount: number): boolean {
    if (word < 0 || word >= WORD_COUNT || amount <= 0) return false;
    const before = this.grasp[word]!;
    if (before >= 1) return false;
    const after = Math.min(1, before + amount);
    this.grasp[word] = after;
    return before < KNOWN && after >= KNOWN;
  }

  /** O quanto ela domina a palavra, 0..1. */
  graspOf(word: number): number {
    return word >= 0 && word < WORD_COUNT ? this.grasp[word]! : 0;
  }

  knows(word: number): boolean {
    return this.graspOf(word) >= KNOWN;
  }

  /** Quantas palavras ela realmente sabe. */
  get size(): number {
    let count = 0;
    for (let i = 0; i < WORD_COUNT; i++) if (this.grasp[i]! >= KNOWN) count += 1;
    return count;
  }

  /** As palavras que ela sabe, na ordem do vocabulário. */
  known(): number[] {
    const words: number[] = [];
    for (let i = 0; i < WORD_COUNT; i++) if (this.grasp[i]! >= KNOWN) words.push(i);
    return words;
  }

  /** Uma palavra que ela sabe e a outra não — o que há para ensinar. */
  somethingToTeach(other: Lexicon): number {
    for (let i = 0; i < WORD_COUNT; i++) {
      if (this.grasp[i]! >= KNOWN && other.grasp[i]! < KNOWN) return i;
    }
    return -1;
  }

  /**
   * O esquecimento do que ficou pela metade.
   *
   * Só o que ainda não virou conhecimento esvanece. É o que impede que ouvir
   * uma palavra solta uma vez na vida conte como saber falar — e é o que faz a
   * repetição ser o método, não o atalho.
   */
  fade(dt: number): void {
    for (let i = 0; i < WORD_COUNT; i++) {
      const value = this.grasp[i]!;
      if (value > 0 && value < KNOWN) this.grasp[i] = Math.max(0, value - FADE_PER_SECOND * dt);
    }
  }

  /** Herança cultural: o filhote já nasce com parte do que o pai sabia dizer. */
  inheritFrom(other: Lexicon, fraction: number): void {
    for (let i = 0; i < WORD_COUNT; i++) {
      this.grasp[i] = Math.max(this.grasp[i]!, other.grasp[i]! * fraction);
    }
  }
}
