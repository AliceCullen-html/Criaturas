/**
 * Microcomportamentos: o que a criatura faz quando não está fazendo nada.
 *
 * Nenhum destes tem função mecânica. Não matam fome, não rendem pontos, não
 * mudam atributo nenhum. Existem porque um bicho que só anda em linha reta até
 * a comida parece um NPC esperando ordens, e um que para no meio do caminho
 * para cheirar uma flor parece vivo.
 *
 * O vocabulário mora aqui, no kernel, porque é a única coisa que a **simulação**
 * (que escolhe a pose) e o **renderer** (que a anima) precisam combinar entre
 * si — e nenhum dos dois pode importar do outro.
 */

export const POSE = {
  none: 0,
  /** Coça a cabeça. */
  scratch: 1,
  /** Espreguiça, alongando o corpo. */
  stretch: 2,
  /** Senta por alguns segundos. */
  sit: 3,
  /** Deita — de preferência na sombra. */
  lie: 4,
  /** Olha para o céu. */
  lookUp: 5,
  /** Abaixa e cheira uma flor. */
  sniff: 6,
  /** Congela, orelhas em pé, ouvindo alguma coisa. */
  listen: 7,
  /** Debruça para olhar a água (ou a própria sombra). */
  lookDown: 8,
  /** Se sacode inteira. */
  shake: 9,
  /** Rola no chão. */
  roll: 10,
  /** Se cata, se limpa. */
  groom: 11,
  /** Cava o chão. */
  dig: 12,
  /** Escorrega na beira da água e se recupera. */
  slip: 13,
  /** Fica parada olhando o nada. */
  ponder: 14,
  /** Brinca com uma folha. */
  play: 15,
  /** Se anima de repente, sem motivo. */
  perk: 16,
  /** Suspira. */
  sigh: 17,
  /** Encolhida de dor, depois de apanhar. */
  hurt: 18,
  /**
   * Sendo esfregada pelo jogador. Diferente de `groom`: aquilo é ela se
   * catando sozinha, isto é a esponja na mão de alguém.
   */
  bathe: 19,
  /** Comendo: a boca abre e fecha na fruta. */
  eat: 20,
} as const;

export type PoseId = (typeof POSE)[keyof typeof POSE];

export const POSE_COUNT = 21;

/** Quanto tempo cada pose dura, em segundos. */
export const POSE_DURATION: readonly number[] = [
  0, // none
  1.6, // scratch
  1.8, // stretch
  4.5, // sit
  7, // lie
  2.4, // lookUp
  2.2, // sniff
  2, // listen
  2.6, // lookDown
  1.1, // shake
  1.8, // roll
  3.2, // groom
  2.4, // dig
  1.2, // slip
  5, // ponder
  3, // play
  1, // perk
  1.6, // sigh
  3, // hurt
  0.5, // bathe — enquanto a esponja passa, e nem um segundo a mais
  0.8, // eat
];

/** Nome legível — usado nos relatórios de observação, não na tela. */
export const POSE_NAMES: readonly string[] = [
  'nada',
  'se coça',
  'espreguiça',
  'senta',
  'deita',
  'olha o céu',
  'cheira uma flor',
  'para e escuta',
  'olha a água',
  'se sacode',
  'rola no chão',
  'se limpa',
  'cava',
  'escorrega',
  'fica pensando',
  'brinca com uma folha',
  'se anima',
  'suspira',
  'encolhida de dor',
  'tomando banho',
  'comendo',
];

/**
 * As poses que NÃO nascem do ócio.
 *
 * As outras são microcomportamento: a criatura escolhe, e o sistema de ócio as
 * sorteia quando não há nada acontecendo. Estas duas vêm do mundo — a esponja
 * na mão do jogador e a fruta na boca dela — e por isso o ócio não pode
 * sorteá-las nem interrompê-las.
 */
export const FORCED_POSES: readonly number[] = [POSE.bathe, POSE.eat];
