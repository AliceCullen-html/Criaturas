import type { CreatureMemory, Intent, Lexicon, Mood } from '@core';
import { defineComponent } from '@engine';
import type { Genome, PersonalityTraits } from '@genetics';

/**
 * Sexo — e o `none` não é um caso de borda, é o COMEÇO.
 *
 * A espécie nasce assexuada: a primeira criatura do mundo se duplica por
 * brotamento. Machos e fêmeas só aparecem quando a população cruza um limiar e
 * a espécie muda de fase. Guardar isso como um terceiro valor, em vez de um
 * `sex: Sex | null`, é o que deixa a fase assexuada ser um estado legítimo da
 * vida e não a ausência de um dado.
 */
export type Sex = 'M' | 'F' | 'none';

/**
 * O que a criatura está fazendo agora (escolhido por pontuação, não por
 * script) e a expressão que isso lhe dá.
 *
 * Os dois vocabulários vieram para o kernel junto com as poses, e pelo mesmo
 * motivo: quem ESCOLHE a intenção é esta camada, mas quem a DESENHA é o
 * renderer, e os dois só podem se encontrar no núcleo. Aqui ficou o
 * reencaminhamento, para o resto do jogo continuar pedindo `Intent` e `Mood` a
 * @creatures, que é onde eles fazem sentido.
 */
export type { Intent, Mood };

/** Marca uma entidade como criatura. */
export const Creature = defineComponent<true>('Creature');

/**
 * O OVO — a vida antes de começar.
 *
 * Toda criatura deste mundo nasce de um ovo, inclusive a primeira. E a decisão
 * de projeto que sustenta isso é o que ela NÃO tem: enquanto está na casca, a
 * entidade existe inteira — genoma, nome, aparência, linhagem — mas **não
 * carrega o marcador `Creature`**.
 *
 * Isso não é um truque: é a afirmação, no código, de que um ovo ainda não é uma
 * criatura. Todos os sistemas do jogo varrem `Creature` — decidir, andar, comer,
 * sentir fome, fazer amizade, aprender palavras, se duplicar. Um ovo não faz
 * nada disso, e não faz porque simplesmente não está na lista. Nenhum sistema
 * precisou ganhar uma exceção, e nenhum vai precisar: o que for escrito amanhã
 * também vai passar direto por ele.
 *
 * Ao nascer, a entidade ganha o marcador e continua a mesma — o nome que estava
 * no ovo é o nome de quem saiu dele.
 */
export interface Egg {
  /** Segundos já passados dentro da casca. */
  time: number;
  /** Quantos segundos leva para romper. */
  duration: number;
  /**
   * Calor que a mão do jogador deixou. Decai sozinho e apressa a eclosão
   * enquanto dura — é a primeira coisa que se pode fazer por uma criatura, e
   * acontece antes de ela existir.
   */
  warmth: number;
}
export const Egg = defineComponent<Egg>('Egg');

/** Necessidades fisiológicas, 0..1. hunger/thirst: 0 = saciado, 1 = crítico. */
export interface Needs {
  hunger: number;
  thirst: number;
  energy: number;
  health: number;
  /**
   * Sujeira, 0..1. Sobe sozinha, devagar — viver no mato suja.
   *
   * Não mata nem adoece: incomoda. Uma criatura encardida fica um pouco menos
   * feliz, e é só isso — o banho existe para ser um CUIDADO, não uma tarefa com
   * prazo. Se a sujeira matasse, dar banho viraria obrigação.
   */
  dirt: number;
  /**
   * VONTADE DE BRINCAR, 0..1. Sobe sozinha e desce brincando.
   *
   * É a peça que faltava para a brincadeira ser um apetite e não um vício.
   * Sem ela, a bola era a única coisa do jardim de que ninguém se cansava: a
   * criatura empurrava a bola até a energia acabar, num canto, esquecida do
   * resto do mundo — que é o oposto do que um brinquedo faz com um bicho de
   * verdade. Um bicho brinca, se satisfaz e vai fazer outra coisa; e a vontade
   * volta sozinha meia hora depois.
   *
   * Sobe mais depressa em filhote e em quem é brincalhão de nascença: é a
   * mesma diferença entre um cachorro de dois anos e um de doze.
   */
  play: number;
}
export const Needs = defineComponent<Needs>('Needs');

/**
 * Estado emocional, 0..1 (exibido 0–100). Muda continuamente com os
 * acontecimentos e é o principal insumo das decisões.
 */
export interface Emotions {
  happiness: number;
  fear: number;
  trust: number;
  curiosity: number;
  stress: number;
  anger: number;
  sleepiness: number;
  loneliness: number;
  /**
   * Marca deixada por agressões repetidas. Sobe rápido e desce quase nada:
   * eleva o medo de base, atrapalha o sono e deixa a criatura arisca por
   * muito tempo. Filhotes herdam parte dela por aprendizado social.
   */
  trauma: number;
  /**
   * A CICATRIZ: o fundo do poço do trauma, o que não passa.
   *
   * O trauma sobe rápido e desce devagar — mas desce. Isto não. A cicatriz só
   * se forma quando o trauma fica ALTO POR MUITO TEMPO: um susto não deixa
   * marca, um mês de maus-tratos deixa. Depois de formada, ela é o piso para
   * onde o trauma volta e o piso do medo que a criatura vai ter para sempre.
   *
   * Existe porque sem ela toda crueldade era temporária. Bastava esperar vinte
   * minutos e a criatura voltava a ser a mesma, como se nada tivesse
   * acontecido — o que faz do sofrimento um número passageiro, e não uma
   * história. Uma criatura marcada pode voltar a confiar, mas leva a vida
   * inteira, e alguma coisa nela nunca mais é o que era.
   */
  scar: number;
  /**
   * Dor aguda. Diferente do trauma, que é a marca psicológica: isto é o corpo
   * doendo AGORA. Some sozinha em minutos, mas enquanto dura ela encolhe, manca
   * e não consegue fazer mais nada.
   */
  pain: number;
}
export const Emotions = defineComponent<Emotions>('Emotions');

/** Genoma bruto (herdado e mutado). */
export const CreatureGenome = defineComponent<Genome>('Genome');

/** Traços de temperamento expressos pelo genoma. */
export const Personality = defineComponent<PersonalityTraits>('Personality');

/** Dados biológicos. `age`/`lifespan` em segundos de simulação. */
export interface Bio {
  sex: Sex;
  species: string;
  age: number;
  lifespan: number;
  metabolism: number;
  matingCooldown: number;
}
export const Bio = defineComponent<Bio>('Bio');

/** Fenótipo físico. */
export interface Attributes {
  speed: number;
  vision: number;
  strength: number;
  fertility: number;
  size: number;
}
export const Attributes = defineComponent<Attributes>('Attributes');

/** Aparência procedural. `features` semeia o sprite (olhos, orelhas, manchas). */
export interface Appearance {
  bodyColor: number;
  accentColor: number;
  eyeColor: number;
  features: number;
  /** Índice da espécie: liga o comportamento (genetics) à silhueta (rendering). */
  speciesIndex: number;
}
export const Appearance = defineComponent<Appearance>('Appearance');

/** Linhagem, para o painel e para a herança cultural. */
export interface Lineage {
  generation: number;
  parentA: string | null;
  parentB: string | null;
}
export const Lineage = defineComponent<Lineage>('Lineage');

/**
 * O LAÇO SOCIAL, lido da memória e guardado aqui pronto.
 *
 * A amizade não é um sistema novo: ela já existia, espalhada, dentro da
 * memória associativa — toda vez que duas criaturas brincam, dividem comida ou
 * brigam, uma grava uma opinião sobre a outra. O que faltava era LER esse
 * grafo. Procurar o laço mais forte a cada decisão custaria caro; então um
 * sistema o resolve de tempos em tempos e deixa a resposta aqui.
 *
 * Guardar em vez de recalcular também dá estabilidade: uma melhor amiga que
 * troca a cada tick não é uma melhor amiga.
 */
export interface Bond {
  /** Entidade de quem ela mais gosta, ou -1. */
  friend: number;
  /** Força desse laço, 0..1. */
  friendship: number;
  /** Entidade de quem ela menos gosta, ou -1. */
  rival: number;
  rivalry: number;
  /** Segundos até a próxima releitura da memória. */
  recheck: number;
}
export const Bond = defineComponent<Bond>('Bond');

/**
 * O NINHO: o canto do jardim que esta criatura chama de seu.
 *
 * Não é uma construção — é um LUGAR, escolhido pelo uso. Ela dorme onde se
 * sente segura, e o ninho vai lentamente até ali. Quem tem uma melhor amiga
 * puxa o próprio ninho para perto do dela, e é só disso que nascem as famílias
 * dormindo juntas: ninguém programou "durmam em grupo".
 */
export interface Nest {
  x: number;
  y: number;
  /** 0..1 — o quanto aquele canto já é dela mesmo. */
  attachment: number;
}
export const Nest = defineComponent<Nest>('Nest');

/** Identidade dada pelo jogador. */
export interface Identity {
  name: string;
}
export const Identity = defineComponent<Identity>('Identity');

/** Memória associativa e episódica — a base do aprendizado. */
export const Memory = defineComponent<CreatureMemory>('Memory');

/**
 * As palavras que ela sabe.
 *
 * Fica separado da memória porque são coisas diferentes: a memória é o que ela
 * VIVEU, o vocabulário é o que ela consegue DIZER. Uma criatura pode ter comido
 * cem frutas e não saber a palavra "fruta"; e pode saber a palavra sem nunca
 * ter passado mal com nenhuma. É o encontro dos dois que faz o conhecimento
 * atravessar de uma cabeça para outra.
 */
export const Words = defineComponent<Lexicon>('Words');

/** Decisão atual e alvo. `commitment` evita trocar de ideia a cada tick. */
export interface Mind {
  intent: Intent;
  mood: Mood;
  targetX: number;
  targetY: number;
  targetEntity: number;
  commitment: number;
  actionCooldown: number;
  /** Segundos restantes de "recebendo carinho" — expressão apaixonada. */
  affection: number;
  /** Segundos restantes de susto/espanto — expressão surpresa. */
  surprise: number;
  /** Segundos restantes prestando atenção na mão do jogador (olha para ela). */
  attention: number;
  /**
   * Há quantos segundos o corpo está sendo barrado por algo sólido.
   *
   * Ninguém aqui calcula rota: a criatura anda reto e desliza no obstáculo. Sem
   * este contador ela insiste para sempre contra a mesma pedra e morre de fome
   * encostada nela. Passado um tempo, desiste e tenta por outro lado.
   */
  blocked: number;
}
export const Mind = defineComponent<Mind>('Mind');

/**
 * O microcomportamento em curso — o que a criatura está fazendo enquanto não
 * está indo a lugar nenhum. Fica separado de `Mind` de propósito: `Mind` é a
 * intenção (para onde vou, por quê), isto é o gesto (o que meu corpo faz agora).
 * O rosto continua contando a emoção; a pose conta a ocupação.
 */
export interface Behavior {
  /** Índice em `POSE` (de @core). 0 = nenhuma. */
  pose: number;
  /** Segundos já decorridos dentro da pose. */
  elapsed: number;
  /** Duração sorteada para esta pose. */
  duration: number;
  /** Segundos até cogitar a próxima — evita gesticular sem parar. */
  cooldown: number;
}
export const Behavior = defineComponent<Behavior>('Behavior');

/**
 * NO COLO — a criatura está na mão do jogador.
 *
 * É um componente e não uma flag dentro de `Mind` porque enquanto ela está no
 * ar ela sai do mundo pelo mesmo mecanismo que o ovo usa para não ser criatura:
 * quem a carrega é a mão, e os sistemas que a moveriam simplesmente passam por
 * ela. A intenção continua lá dentro, intacta — quando os pés voltam ao chão,
 * ela continua o que estava fazendo.
 *
 * O tempo no ar importa: bicho nenhum gosta de ficar pendurado para sempre. Os
 * primeiros segundos no colo de quem ela confia são carinho; passados eles,
 * ela começa a se debater.
 */
export interface Carried {
  /** Segundos no ar. */
  time: number;
  /** De onde ela foi levantada, para saber a queda quando for solta. */
  fromX: number;
  fromY: number;
}
export const Carried = defineComponent<Carried>('Carried');
