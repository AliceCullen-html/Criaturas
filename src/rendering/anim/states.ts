import { MOOD, POSE, type Intent } from '@core';

/**
 * A MÁQUINA DE ESTADOS DA CRIATURA.
 *
 * De um lado, o que a simulação sabe: a intenção, o gesto em curso, as
 * emoções, a marca do trauma, se ela está andando e quão depressa. Do outro,
 * duzentas e tantas animações na pasta. Isto aqui é a ponte, e é uma TABELA —
 * não um emaranhado de `if`s espalhados pelo renderer.
 *
 * A tabela é ordenada por urgência: a primeira regra que casar manda. É por
 * isso que morrer vem antes de comer e comer vem antes de piscar, e é por isso
 * que acrescentar um estado novo amanhã é acrescentar uma linha — não mexer em
 * nada do que já existe.
 *
 * TRANSIÇÃO. Um estado não pisca para o outro: entre andar e correr existe uma
 * travessia, e ao SAIR de correr para parar existe a freada. Quem descreve
 * isso é a própria tabela (`enter`), que pode pedir uma animação de uma vez só
 * antes da animação de laço do estado.
 *
 * As chaves são as do catálogo — os nomes do meio dos arquivos de sprite. Uma
 * chave que não existir na pasta cai no `idle`, e o carregador avisa.
 *
 * O OVO NÃO ESTÁ AQUI, e é uma decisão. A folha traz `chocarOvo`,
 * `ovoRachando`, `nascimento` — mas nenhuma delas é um ovo: todas mostram o
 * PAI ao lado do ovo, chocando, esperando, recebendo. Usar qualquer uma para
 * desenhar um ovo do jardim põe na tela uma criatura que não existe, ao lado
 * do ovo de verdade — foi o que aconteceu, e o jogador passou a tentar fazer
 * carinho num desenho. O ovo continua com o desenho dele, no renderer; estas
 * animações ficam guardadas para quando houver criatura chocando de verdade.
 */

/** O que a máquina precisa saber da criatura. Vem do buffer de render. */
export interface CreatureSignals {
  /** Intenção da simulação: 'wander', 'seekFood', 'sleep', 'play'… */
  intent: Intent;
  /** Micro-gesto em curso (índice de `POSE` em @core). */
  pose: number;
  /** Humor dominante (índice de `Mood`). */
  mood: number;
  moving: boolean;
  /** Velocidade em pixels de mundo por segundo. */
  speed: number;
  /** Carregando alguma coisa na boca? */
  carrying: boolean;
  /** 0..1 — a marca que não passa. */
  scar: number;
  fear: number;
  happiness: number;
  energy: number;
  health: number;
  /** A mão do jogador está encostada nela? */
  touched: boolean;
  /** No colo: os pés dela não estão no chão. */
  carried: boolean;
  isBaby: boolean;
}

/** Nome do estado — o vocabulário do briefing. */
export type StateName =
  | 'Dead'
  | 'Held'
  | 'Sick'
  | 'Fear'
  | 'Trauma'
  | 'Bath'
  | 'Pet'
  | 'Eat'
  | 'Drink'
  | 'Sleep'
  | 'PlayBall'
  | 'Learn'
  | 'Social'
  | 'Courtship'
  | 'Carry'
  | 'Search'
  | 'Curious'
  | 'Run'
  | 'Walk'
  | 'Sit'
  | 'Pose'
  | 'Idle';

/**
 * PRIORIDADES.
 *
 * A régua que impede a animação de piscar de cortar a de morrer. Vale para o
 * animador inteiro: quem pede uma animação diz com que autoridade pede.
 */
export const PRIORITY = {
  ambient: 0,
  idle: 10,
  locomotion: 20,
  gesture: 30,
  interaction: 50,
  urgent: 70,
  fatal: 100,
} as const;

export interface StateRule {
  state: StateName;
  /** Quando esta regra vale. A primeira que casar manda. */
  when: (signals: CreatureSignals) => boolean;
  /** A animação em laço do estado. */
  clip: (signals: CreatureSignals) => string;
  /** A animação de UMA VEZ que entra antes dela, se houver. */
  enter?: (signals: CreatureSignals, from: StateName | null) => string | null;
  priority: number;
  /** Multiplicador de velocidade do laço — o corpo conta o humor. */
  rate?: (signals: CreatureSignals) => number;
}

/** Acima disto o passo vira corrida. */
const RUN_SPEED = 42;
/** A velocidade em que o ciclo de passo toca no tempo natural da folha. */
const WALK_SPEED = 22;

/**
 * OS MICROCOMPORTAMENTOS, ligados ao desenho de cada um.
 *
 * A simulação já escolhia estes gestos há muito tempo — coçar, farejar, rolar,
 * pensar, suspirar —, e eles eram animados por deformação do corpo, porque não
 * havia desenho. Agora há um para cada. A tabela é o mapa, e é ela que faz um
 * gesto novo do lado da simulação precisar só de um PNG do lado do desenho.
 *
 * Os dois que faltam de propósito — banho e comer — têm regra própria acima,
 * porque não são maneirismo: são o que ela está fazendo, com animação de
 * entrada e evento de quadro.
 */
export const POSE_CLIP: Readonly<Record<number, string>> = {
  [POSE.scratch]: 'cocar',
  [POSE.stretch]: 'espreguicar',
  [POSE.lookUp]: 'olharCima',
  [POSE.sniff]: 'farejar',
  [POSE.listen]: 'observar',
  [POSE.lookDown]: 'olharBaixo',
  [POSE.shake]: 'sacudirAgua',
  [POSE.roll]: 'rolar',
  [POSE.groom]: 'limparCorpo',
  [POSE.dig]: 'investigar',
  [POSE.slip]: 'escorregar',
  [POSE.ponder]: 'pensar',
  [POSE.play]: 'brincarSozinho',
  [POSE.perk]: 'surpreso',
  [POSE.sigh]: 'entediado',
  [POSE.hurt]: 'tremer',
};

/**
 * A TABELA. Lida de cima para baixo; a primeira regra que casar é o estado.
 */
export const STATES: readonly StateRule[] = [
  {
    state: 'Dead',
    when: (s) => s.health <= 0,
    clip: () => 'morte',
    priority: PRIORITY.fatal,
  },
  {
    state: 'Sick',
    when: (s) => s.health < 0.35,
    clip: (s) => (s.moving ? 'cambalear' : 'doente'),
    enter: () => 'tossir',
    priority: PRIORITY.urgent,
  },
  {
    // O TRAUMA MUDA O CORPO. Uma criatura marcada não anda como as outras:
    // encolhida, e congelando quando a mão do jogador aparece.
    state: 'Trauma',
    when: (s) => s.scar > 0.25 && s.fear > 0.45,
    clip: (s) => (s.moving ? 'fugir' : 'encolher'),
    enter: (_s, from) => (from === 'Trauma' ? null : 'congelar'),
    priority: PRIORITY.urgent,
    rate: () => 1.15,
  },
  {
    state: 'Fear',
    when: (s) => s.fear > 0.55 || s.mood === MOOD.afraid,
    clip: (s) =>
      s.isBaby ? (s.moving ? 'filhoteFoge' : 'filhoteChora') : s.moving ? 'fugir' : 'assustar',
    priority: PRIORITY.urgent,
    rate: () => 1.2,
  },
  {
    // NO COLO. Vem antes de tudo que é rotina e depois do que é grave: uma
    // criatura morrendo na sua mão está morrendo, não sendo carregada.
    //
    // Os dois desenhos são a história inteira do gesto: quem confia se
    // aninha, quem não confia se debate — e é a MESMA mão fazendo a mesma
    // coisa. O que muda é de quem é o colo.
    state: 'Held',
    when: (s) => s.carried,
    clip: (s) => (s.fear > 0.5 || s.scar > 0.3 ? 'balancar' : 'colo'),
    enter: () => 'erguer',
    priority: PRIORITY.interaction,
    rate: (s) => (s.fear > 0.5 ? 1.4 : 0.9),
  },
  {
    state: 'Bath',
    when: (s) => s.pose === POSE.bathe,
    clip: () => 'esfregar',
    enter: () => 'espuma',
    priority: PRIORITY.interaction,
  },
  {
    state: 'Pet',
    when: (s) => s.touched,
    clip: () => 'afagar',
    priority: PRIORITY.interaction,
  },
  {
    // COMER é uma pequena história: pegar, mastigar, engolir. A entrada faz a
    // primeira parte; o laço, a segunda. Filhote com fome não procura comida —
    // ele PEDE, que é a diferença entre um bicho crescido e um filhote.
    state: 'Eat',
    when: (s) => s.pose === POSE.eat || s.intent === 'seekFood',
    clip: (s) => (s.pose === POSE.eat ? 'mastigar' : s.isBaby ? 'pedirComida' : 'procurarComida'),
    enter: (s) => (s.pose === POSE.eat ? 'pegarComida' : null),
    priority: PRIORITY.gesture,
  },
  {
    state: 'Drink',
    when: (s) => s.intent === 'seekWater',
    clip: () => 'beber',
    priority: PRIORITY.gesture,
  },
  {
    state: 'Sleep',
    when: (s) => s.intent === 'sleep' || s.pose === POSE.lie,
    clip: (s) => (s.isBaby ? 'filhoteDorme' : 'dormir'),
    enter: (_s, from) => (from === 'Sleep' ? null : 'bocejar'),
    priority: PRIORITY.gesture,
    rate: () => 0.7,
  },
  {
    state: 'PlayBall',
    when: (s) => s.intent === 'play',
    clip: (s) => (s.moving ? 'buscarBola' : 'chutarBola'),
    priority: PRIORITY.gesture,
  },
  {
    state: 'Learn',
    when: (s) => s.intent === 'study',
    clip: () => 'aprender',
    priority: PRIORITY.gesture,
  },
  {
    state: 'Social',
    when: (s) => s.intent === 'socialize' || s.intent === 'follow',
    clip: (s) =>
      s.moving ? (s.isBaby ? 'seguirMae' : 'seguirAmigo') : s.isBaby ? 'pedirColo' : 'conversar',
    priority: PRIORITY.gesture,
  },
  {
    state: 'Courtship',
    when: (s) => s.intent === 'mate',
    clip: () => 'cortejar',
    priority: PRIORITY.gesture,
  },
  {
    state: 'Carry',
    when: (s) => s.carrying,
    clip: () => 'segurarComida',
    priority: PRIORITY.gesture,
  },
  {
    state: 'Search',
    when: (s) => s.intent === 'search',
    clip: () => 'investigar',
    priority: PRIORITY.gesture,
  },
  {
    state: 'Curious',
    when: (s) => s.intent === 'watch' || s.mood === MOOD.curious,
    clip: () => 'observar',
    priority: PRIORITY.gesture,
  },
  {
    // SENTAR tem entrada e laço diferentes: primeiro ela se abaixa, depois
    // fica sentada. É a mesma ideia da freada, do outro lado do corpo.
    state: 'Sit',
    when: (s) => s.pose === POSE.sit,
    clip: () => 'descansar',
    enter: (_s, from) => (from === 'Sit' ? null : 'sentar'),
    priority: PRIORITY.gesture,
  },
  {
    // O MANEIRISMO — uma regra só para os dezesseis gestos da tabela acima.
    // Andando ela não se coça: o corpo está ocupado com o passo.
    state: 'Pose',
    when: (s) => !s.moving && POSE_CLIP[s.pose] !== undefined,
    clip: (s) => POSE_CLIP[s.pose]!,
    priority: PRIORITY.gesture,
  },
  {
    // CORRER e ANDAR são o mesmo estado com velocidades diferentes, e a
    // travessia entre eles é o que impede o pulo seco de um para o outro.
    state: 'Run',
    when: (s) => s.moving && s.speed > RUN_SPEED,
    clip: () => 'correr',
    priority: PRIORITY.locomotion,
    rate: (s) => 0.8 + s.speed / 90,
  },
  {
    state: 'Walk',
    when: (s) => s.moving,
    clip: () => 'caminhar',
    // Saindo da corrida, ela FREIA antes de voltar ao passo.
    enter: (_s, from) => (from === 'Run' ? 'frear' : null),
    priority: PRIORITY.locomotion,
    // O CICLO DO PASSO ACOMPANHA A VELOCIDADE — e o humor por cima.
    //
    // Um ciclo de passo com tempo fixo é o defeito mais visível de um sistema
    // de animação: a criatura lenta patina no chão e a apressada dá passinhos
    // curtos. Amarrar a velocidade da animação à velocidade do corpo é o que
    // faz o pé parecer que empurra o chão. Depois disso, o humor: feliz anda
    // saltitando, triste se arrasta, cansada também.
    rate: (s) =>
      Math.min(1.7, Math.max(0.55, s.speed / WALK_SPEED)) *
      (s.mood === MOOD.happy || s.mood === MOOD.playful
        ? 1.25
        : s.mood === MOOD.sad || s.energy < 0.3
          ? 0.7
          : 1),
  },
  {
    // O OCIOSO — que de ocioso não tem nada: é aqui que a EMOÇÃO fica visível.
    // Parada é quando dá para ver o que ela sente, e é por isso que este é o
    // único estado cuja animação sai do humor, e não do que ela está fazendo.
    state: 'Idle',
    when: () => true,
    clip: (s) =>
      s.mood === MOOD.sleepy
        ? 'descansar'
        : s.mood === MOOD.sad
          ? s.happiness < 0.2
            ? 'chorando'
            : 'triste'
          : s.mood === MOOD.happy
            ? s.happiness > 0.85
              ? 'muitoFeliz'
              : 'feliz'
            : s.mood === MOOD.loved
              ? 'carinhoso'
              : s.mood === MOOD.angry
                ? 'bravo'
                : s.mood === MOOD.needy
                  ? 'solitario'
                  : s.mood === MOOD.surprised
                    ? 'surpreso'
                    : s.mood === MOOD.hungry
                      ? 'pedir'
                      : s.mood === MOOD.thirsty
                        ? 'pedirAgua'
                        : s.mood === MOOD.playful
                          ? 'brincarSozinho'
                          : s.isBaby
                            ? 'filhoteExplora'
                            : 'idle',
    enter: (_s, from) => (from === 'Run' ? 'frear' : null),
    priority: PRIORITY.idle,
    rate: () => 1,
  },
];

/** Qual estado descreve esta criatura agora. */
export function stateFor(signals: CreatureSignals): StateRule {
  for (const rule of STATES) if (rule.when(signals)) return rule;
  return STATES[STATES.length - 1]!;
}

/**
 * AS MICROANIMAÇÕES DO OCIOSO.
 *
 * "Nunca deixar o sprite completamente parado" é o pedido, e a resposta não é
 * uma animação de respirar tocando para sempre: é o repertório de coisas
 * pequenas que um bicho faz quando não está fazendo nada. Piscar, olhar em
 * volta, bocejar, espreguiçar, cheirar o chão. Sorteadas de tempos em tempos,
 * por cima do laço do ocioso, elas são a diferença entre um boneco e um bicho.
 */
export const IDLE_FILLERS: readonly string[] = [
  'piscar',
  'olharLados',
  'olharCima',
  'olharBaixo',
  'bocejar',
  'espreguicar',
  'farejar',
  'cheirarFlor',
  'pensar',
];

/** Segundos entre duas microanimações — sorteado dentro desta faixa. */
export const FILLER_GAP: readonly [number, number] = [2.5, 9];
