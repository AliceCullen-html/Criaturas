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
 * O QUE COSTUMA VALER A PENA — a experiência de vida desta criatura.
 *
 * Para cada intenção, o quanto ela historicamente saiu melhor do que entrou.
 * Não é uma nota escrita por ninguém: é a média do que aconteceu com o
 * BEM-ESTAR dela enquanto fazia aquilo. Comer com fome faz o bem-estar subir, e
 * `seekFood` sobe junto; vagar com fome faz descer, e `wander` desce.
 *
 * É a peça que faltava para duas criaturas com o MESMO genoma virarem
 * indivíduos diferentes. Antes, o que as separava era só o gene e a lembrança
 * dos objetos — duas irmãs com os mesmos genes decidiam igual a vida inteira.
 * Agora cada uma carrega o saldo do que a vida dela deu certo, e uma que teve
 * sorte procurando comida vira uma que procura comida; a que passou fome
 * tentando, vira outra coisa.
 *
 * Sem valor "certo" em lugar nenhum: o jardim é que ensina, e ensina diferente
 * para cada uma. Um jardim com muita fruta e um jardim seco criam
 * personalidades diferentes a partir do mesmo ovo.
 */
export interface Habits {
  /**
   * O valor aprendido de cada intenção, 0..1, indexado por `INTENT` (de @core).
   *
   * Começa em 0,5 — nem bom nem ruim. É importante que comece no meio e não em
   * zero: uma criatura que nasce achando que tudo é ruim não experimenta nada, e
   * sem experimentar não aprende. A ignorância aqui é neutra, não pessimista.
   */
  value: number[];
  /** Quantas vezes cada intenção já foi julgada. Poucas tentativas pesam menos. */
  tries: number[];
  /** O bem-estar no instante em que a intenção em curso começou. */
  since: number;
  /** Há quanto tempo ela está nesta intenção, para não julgar um piscar de olhos. */
  elapsed: number;
  /** Qual intenção está sendo julgada agora (índice em `INTENT`). */
  judging: number;
  /**
   * O CAPRICHO DO MOMENTO — a semente do ruído da decisão, que muda devagar.
   *
   * Um número qualquer, trocado de tempos em tempos. Dele sai um empurrãozinho
   * diferente para cada intenção, e o ponto é que ele DURA: enquanto não troca,
   * a criatura tem a mesma inclinação, e por isso não muda de ideia no meio do
   * caminho.
   *
   * Foi a segunda tentativa. Na primeira, o ruído era sorteado a cada
   * reavaliação — e numa caminhada de um minuto até em casa são umas quinze
   * reavaliações, bastando uma virar para ela largar o caminho. Medido: a fração
   * de criaturas que dormiam no próprio ninho caiu de 59–64% para 37–49%. Um
   * ruído que muda a cada instante não é temperamento, é tremor.
   */
  whim: number;
  /** Segundos até o próximo capricho. */
  whimIn: number;
  /**
   * COMO A VIDA VEM INDO, em bem-estar por segundo.
   *
   * A média lenta do que acontece com ela, faça o que fizer. Serve de linha de
   * base: uma intenção é julgada contra ELA, e não contra zero.
   *
   * Sem esta linha, o julgamento não julgava nada. Foi visto no painel: um
   * filhote apavorado e sozinho, com o bem-estar caindo o dia inteiro, tinha
   * aprendido que vagar vale 0,15 e seguir vale 0,11 — tudo ruim, porque tudo
   * mesmo estava ruim. A conta media a vida dele, não as escolhas dele.
   *
   * Contra a linha de base, o que sobra é o que a escolha ACRESCENTA: numa fase
   * ruim, a coisa que faz menos mal sobe. É a diferença entre "estou mal" e "isto
   * aqui me faz bem".
   */
  drift: number;
}
export const Habits = defineComponent<Habits>('Habits');

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
  /**
   * O QUANTO ELA ESTÁ SENDO SACUDIDA, 0..1.
   *
   * Sobe com a distância que a mão percorre por segundo e desce sozinha.
   * Carregar é uma coisa; carregar chacoalhando é outra, e a diferença entre as
   * duas é justamente esta conta — sem ela, sacudir um bicho no ar seria de
   * graça, e nenhum bicho do mundo acha isso de graça.
   */
  shaken: number;
  /**
   * A que altura ela já está, em pixels de tela — ela SOBE para a mão em vez
   * de aparecer lá. É a mesma altura que a queda recebe quando você solta, e é
   * por isso que não há salto em nenhuma das duas pontas do gesto.
   */
  z: number;
  prevZ: number;
}
export const Carried = defineComponent<Carried>('Carried');

/**
 * CAINDO — os pés dela não estão no chão, e ninguém a está segurando.
 *
 * Existe porque soltar uma criatura no ar e ela aparecer no chão no mesmo
 * quadro é o oposto de um jogo com peso. `z` é a altura NA TELA (o mundo aqui
 * é plano; a terceira dimensão é só desenho, como a da bola), e some sozinha.
 */
export interface Falling {
  /** Altura acima do chão, em pixels de tela. */
  z: number;
  /** A altura no passo anterior — o desenho interpola entre as duas. */
  prevZ: number;
  /** Velocidade de queda, em pixels de tela por segundo. */
  vz: number;
  /** De que altura ela partiu — é o que separa um tombo de um pulinho. */
  from: number;
}
export const Falling = defineComponent<Falling>('Falling');
