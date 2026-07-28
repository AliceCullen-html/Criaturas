/**
 * O CINTO DE FERRAMENTAS.
 *
 * A regra do projeto continua valendo: **a tela é do mundo**. O cinto não é um
 * menu — é o que o jogador está SEGURANDO. Escolher uma ferramenta não abre
 * janela, não pausa nada e não pergunta nada: o cursor vira aquele objeto, e a
 * partir daí tudo acontece no jardim, com o mouse, em cima das criaturas e das
 * coisas.
 *
 * Por isso a ferramenta é um estado só, e mora aqui no núcleo: a interface
 * pinta o cinto, o desenho troca o cursor e a simulação decide o que um toque
 * significa — os três precisam concordar sobre o que está na mão, e nenhum
 * deles manda nos outros.
 *
 * A ordem é a do atlas desenhado à mão, e não pode ser mexida sem mexer na arte.
 */

export const TOOL = {
  /** 🍎 Faz cair fruta das árvores, e leva a fruta até a boca. */
  food: 0,
  /** ⚽ Põe uma bola no chão. */
  ball: 1,
  /** 🧽 Esfrega a criatura. */
  bath: 2,
  /** 🎁 Deixa um presente. */
  gift: 3,
  /** 📖 Aponta uma coisa e diz o nome dela. */
  book: 4,
  /** 🥚 Põe um ovo no jardim. */
  egg: 5,
  /** ❤️ Carinho. */
  heart: 6,
  /** ✋ Pega, levanta e solta. */
  hand: 7,
} as const;

export type ToolId = (typeof TOOL)[keyof typeof TOOL];

export const TOOL_COUNT = 8;

/** O nome de cada ferramenta, na ordem do cinto. */
export const TOOL_NAMES: readonly string[] = [
  'comida',
  'bola',
  'banho',
  'presente',
  'ensino',
  'ovo',
  'carinho',
  'pegar',
];

/**
 * Uma linha do que cada uma faz, para o cinto sussurrar.
 *
 * Escrito como instrução de MÃO, não de botão: "esfregue", "arraste até a
 * boca". É a única explicação que o jogo dá, e ela cabe numa linha.
 */
export const TOOL_HINTS: readonly string[] = [
  'toque uma árvore e leve a fruta até a boca dela',
  'toque o chão para largar a bola',
  'esfregue a criatura',
  'toque o chão para deixar um presente',
  'aponte uma coisa para dizer o nome dela',
  'toque o chão para pôr um ovo',
  'passe a mão nela devagar',
  'segure para pegar, solte para largar',
];

/**
 * O ÍNDICE DE CADA ÍCONE NO ATLAS DE QUINZE.
 *
 * O atlas traz, em oito colunas: apple, ball, sponge, gift, book, egg, heart,
 * hand, appleBit, appleCore, bear, flower, pillow, rock, feather. As oito
 * primeiras são as ferramentas, na ordem do cinto — as sete seguintes são
 * coisas do mundo (a maçã mordida, o miolo, e os presentes).
 */
export const ICON = {
  apple: 0,
  ball: 1,
  sponge: 2,
  gift: 3,
  book: 4,
  egg: 5,
  heart: 6,
  hand: 7,
  appleBit: 8,
  appleCore: 9,
  bear: 10,
  flower: 11,
  pillow: 12,
  rock: 13,
  feather: 14,
} as const;

export const ICON_COUNT = 15;
