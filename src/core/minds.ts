/**
 * O QUE A CRIATURA QUER E O QUE ELA SENTE — o vocabulário, só ele.
 *
 * A intenção é escolhida pela IA; o humor é derivado das emoções; e os dois
 * precisam chegar inteiros ao renderer, que é quem transforma "está com medo e
 * indo atrás de comida" em desenho. Como a pose (ao lado, em `poses.ts`), esse
 * vocabulário mora no kernel pela mesma razão: é a única coisa que a
 * **simulação** e o **renderer** têm de combinar entre si, e nenhum dos dois
 * pode importar do outro.
 *
 * A ORDEM DA LISTA É O CÓDIGO. O buffer de render leva números, não texto —
 * são milhares de criaturas por segundo atravessando a fronteira. Guardar a
 * ordem em UM lugar é o que impede o defeito clássico dessa travessia: uma
 * tabela de códigos aqui, outra ali, alguém acrescenta 'search' no meio de uma
 * delas e o jardim inteiro passa a desenhar sono quando a criatura tem sede.
 */

/** As intenções, na ordem em que viram código. */
export const INTENT_NAMES = [
  'wander',
  'seekFood',
  'seekWater',
  'sleep',
  'flee',
  'approachPlayer',
  'socialize',
  'play',
  'attack',
  'share',
  'mate',
  'watch',
  'shelter',
  'sunbathe',
  'search',
  'follow',
  /** Parada diante do computador, aprendendo palavras. */
  'study',
] as const;

export type Intent = (typeof INTENT_NAMES)[number];

/** Nome → código. O inverso de `INTENT_NAMES`. */
export const INTENT = Object.fromEntries(
  INTENT_NAMES.map((name, index) => [name, index]),
) as Record<Intent, number>;

export const INTENT_COUNT = INTENT_NAMES.length;

/** Os humores, na ordem em que viram código. */
export const MOOD_NAMES = [
  'neutral',
  'happy',
  'needy',
  'sleepy',
  'surprised',
  'angry',
  'sad',
  'loved',
  'afraid',
  'curious',
  'hungry',
  'thirsty',
  'playful',
] as const;

export type Mood = (typeof MOOD_NAMES)[number];

/** Nome → código. */
export const MOOD = Object.fromEntries(MOOD_NAMES.map((name, index) => [name, index])) as Record<
  Mood,
  number
>;

export const MOOD_COUNT = MOOD_NAMES.length;
