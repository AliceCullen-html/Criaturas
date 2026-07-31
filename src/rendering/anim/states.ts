import { COMPANY, MOOD, POSE, type Intent } from '@core';

/**
 * As historinhas, por número.
 *
 * Repetidos aqui de propósito: `ROUTINE` mora na simulação, e o desenho não
 * pode importar a simulação — a fronteira entre as camadas é o que impede o
 * renderer de virar um segundo cérebro. O que atravessa é o número, pelo buffer,
 * e o teste de cena cobra que os dois lados continuem contando a mesma coisa.
 */
const ROUTINE_STEAL = 2;
const ROUTINE_PROTEST = 3;
const ROUTINE_MAKEUP = 4;

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
 * CADA ANIMAÇÃO É UMA CENA, não uma pose.
 *
 * Esta é a regra que governa a tabela inteira, e ela custou três defeitos para
 * ficar clara. O artista não desenhou o corpo da criatura em várias posições:
 * desenhou CENAS — a criatura E a bola, a criatura E o presente, a criatura E a
 * flor, a criatura E a mão do jogador. `brincarSozinho` tem uma bola dentro.
 * `investigar` tem um presente embrulhado. `observar` tem uma flor. `assustar`
 * tem a mão. `limparCorpo` tem uma esponja.
 *
 * Então uma animação só pode ser usada num estado em que aquilo EXISTE. Pôr
 * `brincarSozinho` no humor brincalhão faz a criatura brincar com uma bola que
 * o jogador nunca deu — foi exatamente o que aconteceu. Para os estados em que
 * ela está sozinha, só servem os desenhos em que ela está sozinha, e é o que
 * `clips.test.ts` cobra: ele MEDE a largura da tinta de cada tira (o corpo dela
 * ocupa 48 px em todas as 223) e recusa qualquer estado solitário que aponte
 * para uma cena.
 *
 * Marcas não contam como cena: coração, balão de pensamento, gotas de suor,
 * riscos de velocidade e o "Z" do sono são linguagem de quadrinho, não objetos
 * do jardim — ninguém tenta pegar um coração.
 *
 * E NÃO BASTA A INTENÇÃO DIZER QUE O OBJETO EXISTE. Uma regra marcada com
 * `withProp` promete que aquilo está lá — mas promessa não é verificação. A
 * intenção `play` cobre quatro brincadeiras (a bola, um amigo, a mão do jogador
 * e a chuva) e só uma tem bola: enquanto a regra olhava a intenção sozinha, um
 * filhote recém-saído do ovo aparecia chutando uma bola que ninguém deu a ele.
 * O `when` de uma regra com objeto tem de cobrar o objeto, e o sinal que
 * responde por ele vem da simulação, que é quem sabe.
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
  /**
   * A brincadeira dela é com uma bola QUE EXISTE no jardim?
   *
   * A intenção `play` sozinha não diz: brincar é com a bola, com um amigo, com
   * a mão do jogador ou com a chuva. Só a primeira tem bola, e só ela pode usar
   * um desenho que traz uma.
   */
  ball: boolean;
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
  /** A que altura do chão ela está, em pixels de tela. Caindo, isto some. */
  lift: number;
  isBaby: boolean;
  /**
   * QUEM ESTÁ AO ALCANCE DO BRAÇO — ver `COMPANY` em @core.
   *
   * O sinal que faltava. A intenção diz o que ela quer; isto diz com quem ela
   * está, e é a diferença entre "brincar" e "brincar junto", entre "dormir" e
   * "dormir junto", entre "atacar" e "discutir com alguém". O artista desenhou
   * as duas versões de cada uma dessas cenas; só a primeira chegava à tela.
   */
  company: number;
  /**
   * A HISTORINHA EM CURSO — ver `ROUTINE` na simulação.
   *
   * Levar uma fruta para uma amiga, roubar, reclamar do roubo, fazer as pazes,
   * guardar um tesouro. Cinco histórias que a simulação conduz desde sempre e
   * que a tela nunca mostrou: por fora eram duas criaturas andando uma na
   * direção da outra, iguais a qualquer outra caminhada.
   */
  routine: number;
}

/** Nome do estado — o vocabulário do briefing. */
export type StateName =
  | 'Dead'
  | 'Held'
  | 'Falling'
  | 'Sick'
  | 'Fear'
  | 'Trauma'
  | 'Bath'
  | 'Pet'
  | 'Refuse'
  | 'Eat'
  | 'Drink'
  | 'Sleep'
  | 'PlayBall'
  | 'PlayTogether'
  | 'Fight'
  | 'Story'
  | 'Tending'
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
  /**
   * ESTA REGRA GARANTE O OBJETO.
   *
   * Marcada, ela só vale quando aquilo que o desenho mostra existe de verdade
   * no jardim: a fruta na boca, a bola no chão, o amigo ao lado, a mão do
   * jogador. As regras SEM esta marca são as da criatura sozinha — e para elas
   * o teste cobra que a arte também esteja sozinha.
   */
  withProp?: boolean;
  /**
   * AS COISAS PEQUENAS QUE PODEM ACONTECER POR CIMA DESTE LAÇO.
   *
   * Um estado não é um desenho: é um tempo em que a criatura está de um jeito, e
   * dentro dele ela ainda pisca, ainda olha em volta, ainda estremece. Sem isso,
   * um estado que dura meio minuto é meio minuto de um desenho só — que é
   * exatamente o que faz um bicho parecer um boneco.
   *
   * Antes, as microanimações entravam por prioridade (`<= idle`), o que na
   * prática queria dizer "só no estado `Idle`". E `Idle` é oito por cento da vida
   * da criatura: medido no jardim, ela passava 27% observando e 44% com medo, e
   * nesses dois nada nunca acontecia — um caso chegou a cento e trinta e um
   * segundos seguidos na mesma tira.
   *
   * Cada estado traz o SEU repertório, porque o repertório é parte do estado:
   * quem está parada boceja e se espreguiça; quem está com medo estremece, se
   * encolhe e espia. Ninguém boceja no meio de uma mordida — e é por isso que a
   * lista é escrita à mão, estado por estado, e não deduzida da prioridade.
   *
   * As tiras daqui passam pela mesma medida de tinta das outras: microanimação
   * também não pode trazer objeto que não existe.
   */
  fillers?: readonly string[];
}

/**
 * AS MICROANIMAÇÕES DO OCIOSO.
 *
 * "Nunca deixar o sprite completamente parado" é o pedido, e a resposta não é
 * uma animação de respirar tocando para sempre: é o repertório de coisas
 * pequenas que um bicho faz quando não está fazendo nada. Piscar, olhar em
 * volta, bocejar, espreguiçar, cheirar o chão. Sorteadas de tempos em tempos,
 * por cima do laço do ocioso, elas são a diferença entre um boneco e um bicho.
 *
 * SÃO TODAS DO CORPO, e nenhuma tem marca de pensamento dentro. Um bicho parado
 * não pergunta nada: ele pisca, olha em volta, boceja, cheira o chão. As tiras
 * com interrogação e balão saíram daqui e foram para `THOUGHT_FILLERS`, que só
 * entra quando a criatura está de fato reparando em alguma coisa — terceira
 * volta do mesmo defeito, e a mais teimosa: um "?" que aparece sem que exista
 * pergunta nenhuma não desenha curiosidade, desenha um jogo travado.
 */
export const IDLE_FILLERS: readonly string[] = [
  'piscar',
  'ansioso',
  'estressado',
  'orgulhoso',
  'olharLados',
  'olharCima',
  'olharBaixo',
  'bocejar',
  'espreguicar',
  'farejar',
  'entediado',
];

/**
 * O REPERTÓRIO DE QUEM ESTÁ REPARANDO EM ALGUMA COISA.
 *
 * Aqui a marca é honesta: há um objeto, um bicho ou uma novidade na frente
 * dela, e o balão diz que aquilo entrou na cabeça. O corpo entra junto — a
 * maior parte do tempo ela só olha, vira a cabeça, cheira — e de vez em quando
 * sai um pensamento.
 */
const THOUGHT_FILLERS: readonly string[] = [
  ...IDLE_FILLERS,
  'curioso',
  'pensar',
  'filhoteExplora',
  'confuso',
];

/**
 * TIRAS QUE PERDEM O OBJETO DESENHADO, PORQUE ELE EXISTE DE VERDADE.
 *
 * Terceira volta do mesmo defeito, e desta vez do outro lado. Antes o problema
 * era usar uma cena onde o objeto NÃO existia — a bola que ninguém deu. Aqui é o
 * contrário: a bola existe, está ali quicando, com física e sombra, desenhada
 * pelo mundo — e a tira desenha OUTRA por cima. O jogador vê duas e não entende
 * de onde saiu a segunda.
 *
 * A saída não é jogar fora a pose que o artista desenhou: é recortar o objeto
 * dela. No quadro, o corpo fica à esquerda e o objeto à direita, separados por
 * uma coluna vazia — o carregador acha essa coluna medindo o alfa e corta ali.
 * Fica a criatura brincando, e a bola que rola é a bola de verdade, a que o
 * jogador pode pegar.
 *
 * Só entram aqui tiras cujo objeto se separa do corpo em TODOS os quadros. É
 * medido, não prometido: `clips.test.ts` reprova quem não tiver corte limpo, e o
 * carregador reclama alto em vez de serrar a criatura ao meio.
 */
export const PROP_IN_THE_WORLD: ReadonlySet<string> = new Set([
  'buscarBola',
  'filhoteBrinca',
  // O COMPANHEIRO FANTASMA — a mesma história da bola, do outro lado.
  //
  // Todas estas tiras de convívio trazem uma SEGUNDA criatura desenhada, pálida,
  // ao lado da primeira. Era por isso que treze das dezenove tiras de convívio
  // nunca entraram no jogo: com as duas criaturas de verdade uma diante da
  // outra, cada uma desenhando a sua sombra, apareceriam quatro bichos numa
  // conversa de dois.
  //
  // A saída é a mesma da bola: recortar. O outro está no jardim, com corpo, cor
  // e genoma próprios — não precisa de retrato. Medido tira a tira: em todas
  // estas há uma coluna limpa entre o corpo e o fantasma. As que não têm ficam
  // de fora e continuam guardadas.
  'brincarJunto',
  'discutir',
  'dormirJunto',
  'empurrarOutro',
  'ignorar',
  'desculpas',
  'reclamar',
  'rejeitar',
  'limparFilhote',
]);

/**
 * O REPERTÓRIO DE QUEM ESTÁ COM MEDO.
 *
 * Uma criatura assustada não é uma estátua tremendo: ela estremece, se encolhe,
 * congela, espia para ver se passou. Medido no jardim depois de uma briga, o
 * medo durava dois minutos — emocionalmente certo, e a tela mostrava a mesma
 * tira de `medo` cento e trinta e um segundos seguidos. O medo era verdade; o
 * desenho é que era um poste.
 *
 * Definido antes da tabela porque é a tabela que o usa.
 */
const FEAR_FILLERS: readonly string[] = ['tremer', 'encolher', 'congelar', 'olharLados'];

/**
 * O REPERTÓRIO DE UMA BRIGA.
 *
 * Brigar existia na simulação desde sempre — a intenção `attack`, o dano, o
 * medo depois — e na tela era uma criatura andando até outra e as duas paradas.
 * O acontecimento mais violento do jardim não tinha desenho nenhum.
 *
 * `brigar` continua de fora: é a única do conjunto em que o fantasma encosta no
 * corpo, e serrá-la ao meio deixaria a criatura sem braço. As três que sobram
 * contam a mesma cena — encarar, discutir, empurrar.
 */
const FIGHT_FILLERS: readonly string[] = ['discutir', 'empurrarOutro', 'irritado'];

/**
 * O REPERTÓRIO DE QUEM ESTÁ CUIDANDO DE UM FILHOTE.
 *
 * Nada aqui obriga ninguém a cuidar de ninguém: quem chega perto de um filhote
 * chega porque quis. Mas quando chega, o desenho passa a ser o de um adulto com
 * um filhote ao lado — limpar, ensinar, defender — em vez do de um adulto
 * qualquer parado. É a mesma diferença entre "estar perto" e "estar com".
 */
const TENDING_FILLERS: readonly string[] = [
  'limparFilhote',
  // `carinhoso` e `olharOutro` NÃO entram aqui: são os dois laços do estado, e
  // uma tira que é laço e microanimação ao mesmo tempo se emenda consigo mesma
  // — treze segundos seguidos na medida de vivacidade.
  'olharBaixo',
  'piscar',
  'farejar',
  'bocejar',
  'espreguicar',
];

/**
 * O REPERTÓRIO DE UMA BRINCADEIRA A DOIS.
 *
 * Sem isto, `brincarJunto` ficou vinte segundos seguidos na tela — medido pelo
 * teste de vivacidade, que existe justamente para isso. Brincar dura, e um laço
 * que dura precisa de coisas acontecendo dentro dele, senão é um poste alegre.
 */
const PLAY_FILLERS: readonly string[] = [
  'muitoFeliz',
  'feliz',
  'comemorar',
  'acenar',
  'olharOutro',
];

/**
 * O REPERTÓRIO DE QUEM ESTÁ DOENTE — tosse, espirro, febre, tremor.
 *
 * Doente ela ficava no laço de `doente`, treze segundos seguidos na medida. Uma
 * criatura adoentada não fica quieta: ela tosse, espirra, arde de febre. E são
 * essas coisas pequenas que dizem ao jogador que ela precisa de cuidado — um
 * laço parado não pede nada a ninguém.
 */
const SICK_FILLERS: readonly string[] = [
  'tossir',
  'espirrar',
  'febre',
  'tremer',
  'desmaiar',
  'recuperando',
];

/**
 * O REPERTÓRIO DE UMA REFEIÇÃO.
 *
 * Comer era uma tira só em laço. Uma refeição não é um gesto repetido: é
 * examinar, morder, mastigar, engolir. O artista desenhou a refeição inteira e
 * essas tiras estavam paradas na pasta — e todas mostram a criatura COM a
 * comida, que é justamente o que existe no estado de comer.
 */
const EAT_FILLERS: readonly string[] = ['mastigar', 'engolir', 'examinarComida', 'cheirarComida'];

/**
 * O REPERTÓRIO DE UM BANHO.
 *
 * Mesma história: a esponja é a MÃO DO JOGADOR, e ela está lá — este estado só
 * existe enquanto você esfrega. Espuma, esfregar, limpar o rosto, secar, e o
 * espreguiçar de quem está gostando.
 */
const BATH_FILLERS: readonly string[] = [
  'espuma',
  'esfregar',
  'limparCorpo',
  'limparRosto',
  'secar',
  'espreguicarBanho',
];

/**
 * O REPERTÓRIO DE QUEM DORME.
 *
 * Dormir era um laço de treze segundos. Quem dorme ronca, se mexe, e acorda —
 * e acordar é o que devolve a criatura ao mundo à vista do jogador.
 */
const SLEEP_FILLERS: readonly string[] = ['roncar', 'acordar', 'bocejar'];

/**
 * O REPERTÓRIO DE QUEM FOI MALTRATADO.
 *
 * O trauma tinha quatro tiras e o artista desenhou treze. Estas são as que
 * mostram a criatura SOZINHA com o que ficou nela — esconder o rosto, chorar,
 * olhar de longe, e o começo lento de voltar a confiar. As de recusar (colo,
 * carinho, comida) ficam de fora: elas têm a mão desenhada, e a mão só existe
 * quando o jogador está de fato ali.
 */
const SCAR_FILLERS: readonly string[] = ['esconderRosto', 'chorarT', 'encolher', 'tremer'];

/**
 * O REPERTÓRIO DE QUEM ESTÁ SENDO ACARICIADA.
 *
 * Todas com a MÃO desenhada dentro, e é por isso que só podem viver aqui: este
 * estado só existe enquanto o jogador está de fato encostado nela. `cocegas`,
 * `abracar` e o balançar são o carinho variando; `negarCarinho` é quem não quer
 * — a mão está lá do mesmo jeito, e a recusa é a resposta.
 */
const PET_FILLERS: readonly string[] = ['cocegas', 'abracar', 'balancar', 'negarCarinho'];

/**
 * O REPERTÓRIO DE QUEM ESTÁ COM A BOLA.
 *
 * Oito tiras paradas na pasta, todas com a bola desenhada — e a bola EXISTE
 * neste estado, é a que o jogador largou. Brincar era um laço só; agora é pegar,
 * chutar, girar, sacudir, devolver, largar. É a diferença entre uma criatura
 * empurrando uma bola e uma criatura brincando.
 */
const BALL_FILLERS: readonly string[] = [
  'pegarBola',
  'chutarBola',
  'jogarBola',
  'devolverBola',
  'girarBrinquedo',
  'sacudirBrinquedo',
  'largarBrinquedo',
  'brincarSozinho',
];

/**
 * O REPERTÓRIO DE QUEM ESTÁ BEBENDO — a água está ali, e é ela que aparece.
 */
const DRINK_FILLERS: readonly string[] = ['beberSozinho', 'procurarAgua'];

/**
 * O REPERTÓRIO DE QUEM ESTÁ NA SUA MÃO.
 *
 * No colo, os pés dela não tocam o chão e a mão está desenhada em todas: cair,
 * ser sacudida, ser solta, recusar o colo. Nenhuma delas poderia aparecer em
 * outro lugar — e todas descrevem exatamente o que está acontecendo aqui.
 */
const HELD_FILLERS: readonly string[] = ['sacudir', 'negarColo', 'cairMao'];

/**
 * E o de quem carrega comida na boca: colher, pegar, guardar, jogar fora.
 */
const CARRY_FILLERS: readonly string[] = [
  'colherFruta',
  'pegarComida',
  'guardarComida',
  'jogarComida',
];

/**
 * O REPERTÓRIO DE QUEM ESTÁ COM ALGUÉM.
 *
 * Medido num jardim de meia hora: sessenta e quatro criaturas, e quarenta e sete
 * delas paradas em duas tiras — `cortejar` e `conversar`. As duas têm a boca
 * bem aberta (uma canta, a outra fala), e de longe uma boca aberta parece grito:
 * o jogador olhou o jardim e leu pânico onde havia namoro e conversa.
 *
 * O comportamento não estava errado — o jardim estava cheio, bem alimentado e se
 * reproduzindo, que é o que a espécie faz quando vai bem. Errado era o jardim
 * inteiro fazendo a mesma cara. Estas tiras estavam paradas na pasta: acenar,
 * cumprimentar, olhar a outra, se aproximar, abraçar. Todas mostram a criatura
 * COM alguém, que é a cena que está acontecendo.
 */
const SOCIAL_FILLERS: readonly string[] = [
  'acenar',
  'cumprimentar',
  'olharOutro',
  'aproximar',
  'abracarAmigo',
  'amizade',
  'agradecer',
];

/** E o de quem está cortejando: interesse, aceitação, um beijinho. */
const COURT_FILLERS: readonly string[] = [
  'interesse',
  'aceitar',
  'beijinho',
  'olharOutro',
  'apaixonado',
];

/**
 * O REPERTÓRIO DE UMA AULA.
 *
 * Aprender diante da máquina era `aprender` em laço, e medido no jardim dava
 * trinta e cinco segundos seguidos da mesma tira — um quinto da vida dela. Só
 * que uma aula não é um gesto repetido: ela ouve a palavra, repete, associa ao
 * objeto, lembra, descobre. O artista desenhou a aula inteira e essas tiras
 * estavam paradas na pasta.
 *
 * Todas mostram a criatura DIANTE da máquina, com o cartão na tela — é a mesma
 * cena do laço, e por isso podem entrar por cima dele sem mentir.
 */
const LEARN_FILLERS: readonly string[] = [
  'ouvirPalavra',
  'repetirPalavra',
  'associarObjeto',
  'lembrar',
  'descobrir',
  'copiarOutro',
  'falar',
  'esquecer',
  'observar',
];

/** Acima disto o passo vira corrida. */
const RUN_SPEED = 42;
/** A velocidade em que o ciclo de passo toca no tempo natural da folha. */
const WALK_SPEED = 22;
/** Acima disto, a mão não está levando a criatura: está sacudindo. */
const SHAKE_SPEED = 90;

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
  [POSE.listen]: 'curioso',
  [POSE.lookDown]: 'olharBaixo',
  [POSE.shake]: 'sacudirAgua',
  [POSE.roll]: 'rolar',
  [POSE.groom]: 'cocar',
  [POSE.dig]: 'farejar',
  [POSE.slip]: 'escorregar',
  [POSE.ponder]: 'pensar',
  [POSE.play]: 'muitoFeliz',
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
    // NO COLO — e vem logo depois da morte, na frente do medo inclusive.
    //
    // Estar na sua mão é o fato dominante: uma criatura aterrorizada pendurada
    // no ar não foge nem chora encolhida no chão, ela SE DEBATE. Enquanto o
    // medo vinha antes desta regra, sacudir um filhote o deixava chorando
    // dentro da sua palma, com a animação de quem está sozinho e apavorado no
    // meio do mato — o desenho contava uma cena que não era aquela.
    //
    // Os três desenhos são a história inteira do gesto: quem confia se aninha,
    // quem não confia se debate, e quem está sendo CHACOALHADO se sacode. É a
    // mesma mão fazendo coisas muito diferentes — e é a velocidade dela que
    // separa levar um bicho de um lado para o outro de chacoalhar o bicho.
    state: 'Held',
    when: (s) => s.carried,
    clip: (s) =>
      s.speed > SHAKE_SPEED ? 'sacudir' : s.fear > 0.5 || s.scar > 0.3 ? 'balancar' : 'colo',
    enter: () => 'erguer',
    priority: PRIORITY.interaction,
    rate: (s) => (s.speed > SHAKE_SPEED ? 1.5 : s.fear > 0.5 ? 1.4 : 0.9),
    withProp: true,
    fillers: HELD_FILLERS,
  },
  {
    state: 'Sick',
    when: (s) => s.health < 0.35,
    clip: (s) => (s.moving ? 'cambalear' : 'doente'),
    enter: () => 'tossir',
    priority: PRIORITY.urgent,
    fillers: SICK_FILLERS,
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
    fillers: SCAR_FILLERS,
  },
  {
    // O MEDO TEM UM ARCO — ele começa em pânico e termina em tremor.
    //
    // Medido no jardim: uma briga entre duas criaturas deixa a perdedora com
    // medo por dois minutos, e isso está certo — quem levou uma surra fica
    // arisco. O que estava errado era a tela: a MESMA tira de `medo` ficava
    // cento e trinta e um segundos seguidos, quase metade da vida dela naquele
    // trecho. O medo era verdade; o desenho é que era um poste.
    //
    // O medo não é um valor, é uma curva que desce — e o corpo conta a descida.
    // Pavor no primeiro instante, medo no meio, tremor no fim, enquanto ela se
    // recompõe. A intensidade que escolhe o desenho é a mesma que a simulação já
    // calcula: nada de novo entrou aqui, só passou a ser LIDO.
    state: 'Fear',
    when: (s) => s.fear > 0.55 || s.mood === MOOD.afraid,
    clip: (s) =>
      s.isBaby
        ? s.moving
          ? 'filhoteFoge'
          : 'filhoteChora'
        : s.moving
          ? 'fugir'
          : s.fear > 0.85
            ? 'panico'
            : s.fear > 0.6
              ? 'medo'
              : 'tremer',
    priority: PRIORITY.urgent,
    rate: () => 1.2,
    fillers: FEAR_FILLERS,
  },
  {
    // CAINDO. Largada da mão, ela desce — e o desenho da queda é o da queda da
    // mão, que é de onde ela veio. Prioridade de urgência: no ar não existe
    // fome, nem sono, nem vontade de brincar.
    state: 'Falling',
    when: (s) => s.lift > 0.5,
    clip: () => 'cairMao',
    priority: PRIORITY.urgent,
  },
  {
    state: 'Bath',
    when: (s) => s.pose === POSE.bathe,
    clip: () => 'esfregar',
    enter: () => 'espuma',
    priority: PRIORITY.interaction,
    withProp: true,
    fillers: BATH_FILLERS,
  },
  {
    // VOLTAR A CONFIAR. A tira mostra a criatura E A MÃO, e é por isso que ela
    // não podia entrar em nenhum estado de bicho sozinho — mas aqui a mão está
    // ali de verdade, encostada nela. É a cena exata que o artista desenhou:
    // alguém que foi maltratado deixando ser tocado de novo, devagar.
    state: 'Pet',
    when: (s) => s.touched,
    // Quem carrega uma cicatriz não recebe carinho como quem nunca apanhou:
    // recebe com reserva, e é outra tira. A marca é permanente, então esta cena
    // volta toda vez que a mão chega — a criatura aceita, mas nunca esquece.
    clip: (s) => (s.scar > 0.2 ? 'recuperarConfianca' : 'afagar'),
    priority: PRIORITY.interaction,
    withProp: true,
    fillers: PET_FILLERS,
  },
  {
    // ANDANDO, QUEM MANDA É A CAMINHADA — e daqui para baixo é essa a regra.
    //
    // Um desenho de gesto parado por cima de um corpo que atravessa o jardim é o
    // contrário de animação: as pernas ficam quietas e a criatura desliza no
    // chão. Estas regras vêm ANTES de `Walk` na tabela, então cada uma que
    // desenha um gesto de pé precisa deixar a caminhada passar — e é por isso que
    // elas pedem `!s.moving`.
    //
    // O tamanho do estrago foi medido: `procurarComida` — que é ela PARADA
    // farejando à procura de fruta — ficou cento e vinte e dois segundos seguidos
    // na tela, 58% da vida da criatura, porque a intenção "procurar comida" dura
    // toda a viagem até a árvore. Dois minutos deslizando. Era isso, mais do que
    // qualquer outra coisa, que fazia ela não parecer viva.
    //
    // Comer é uma pequena história: pegar, mastigar, engolir. A entrada faz a
    // primeira parte; o laço, a segunda. E mastigar não pede `!s.moving`, porque
    // a boca é dela: quem está com a fruta na boca está com a fruta na boca.
    // Filhote com fome não procura comida — ele PEDE, que é a diferença entre um
    // bicho crescido e um filhote.
    // VIRAR A CARA PARA A COMIDA.
    //
    // A pose vem do mundo — é a sua mão oferecendo, e a fruta está ali na
    // frente dela. Por isso as duas tiras cabem aqui e não caberiam em lugar
    // nenhum: `recusarComida` tem a fruta desenhada e `negarComida` tem a mão.
    // Quem carrega cicatriz nega a MÃO; quem só não gosta daquilo recusa a
    // COMIDA. É a mesma recusa e são duas coisas diferentes.
    state: 'Refuse',
    when: (s) => s.pose === POSE.refuse,
    clip: (s) => (s.scar > 0.2 ? 'negarComida' : 'recusarComida'),
    priority: PRIORITY.interaction,
    withProp: true,
  },
  {
    state: 'Eat',
    when: (s) => s.pose === POSE.eat || (s.intent === 'seekFood' && !s.moving),
    clip: (s) => (s.pose === POSE.eat ? 'mastigar' : s.isBaby ? 'pedirComida' : 'procurarComida'),
    enter: (s) => (s.pose === POSE.eat ? 'pegarComida' : null),
    priority: PRIORITY.gesture,
    withProp: true,
    fillers: EAT_FILLERS,
  },
  {
    // Beber é de boca na água. O caminho até o lago é caminhada.
    state: 'Drink',
    when: (s) => s.intent === 'seekWater' && !s.moving,
    clip: () => 'beber',
    priority: PRIORITY.gesture,
    withProp: true,
    fillers: DRINK_FILLERS,
  },
  {
    // Ela VAI para o ninho antes de dormir, e no caminho ela anda — devagar,
    // porque a caminhada já conta o cansaço no ritmo do passo.
    // A BRIGA — o acontecimento mais violento do jardim, e o que menos aparecia.
    //
    // `attack` existe na simulação desde sempre: a raiva, a mordida, o dano, o
    // medo que fica depois. Na tela eram duas criaturas paradas uma diante da
    // outra, e o jogador via o resultado (uma delas fugindo machucada) sem
    // nunca ver a causa.
    state: 'Fight',
    when: (s) => s.intent === 'attack' && s.company !== COMPANY.alone,
    clip: () => 'discutir',
    enter: (_s, from) => (from === 'Fight' ? null : 'bravo'),
    priority: PRIORITY.interaction,
    withProp: true,
    fillers: FIGHT_FILLERS,
  },
  {
    // AS HISTORINHAS, finalmente com cara.
    //
    // Cinco rotinas que o `planSystem` conduz há muito tempo — levar uma fruta
    // para uma amiga, roubar, reclamar do roubo, ir atrás de quem brigou e
    // fazer as pazes, guardar um tesouro. Por fora eram duas criaturas
    // caminhando uma na direção da outra, indistinguíveis de qualquer passeio.
    // Uma história que ninguém consegue ver não é uma história.
    //
    // Só vale PARADA e COM ALGUÉM: a viagem até a outra continua sendo
    // caminhada, e uma desculpa sem ninguém na frente é uma criatura falando
    // sozinha.
    // DAR E GUARDAR ficam DE FORA, e é a regra da cena mandando de novo. Nas
    // duas a criatura está com uma fruta de verdade na boca, desenhada pelo
    // mundo, e as tiras que o artista fez para elas — `darPresente`,
    // `guardarFavorito` — trazem um embrulho desenhado dentro. Seriam dois
    // objetos na mesma cena, e o segundo não existe. Essas duas já têm desenho
    // honesto: `segurarComida`, na regra de carregar, logo abaixo.
    state: 'Story',
    when: (s) =>
      !s.moving &&
      s.company !== COMPANY.alone &&
      (s.routine === ROUTINE_STEAL ||
        s.routine === ROUTINE_PROTEST ||
        s.routine === ROUTINE_MAKEUP),
    clip: (s) =>
      s.routine === ROUTINE_STEAL
        ? 'empurrarOutro'
        : s.routine === ROUTINE_PROTEST
          ? 'reclamar'
          : 'desculpas',
    priority: PRIORITY.interaction,
    withProp: true,
  },
  {
    // DORMIR JUNTO. O ninho já puxa quem tem amiga para perto da amiga dela —
    // "ninguém programou durmam em grupo", diz o comentário do ninho — e o
    // resultado disso estava na tela como dois bichos dormindo, cada um por si.
    state: 'Sleep',
    when: (s) => (s.intent === 'sleep' && !s.moving) || s.pose === POSE.lie,
    clip: (s) =>
      s.isBaby
        ? 'filhoteDorme'
        : s.company === COMPANY.friend || s.company === COMPANY.baby
          ? 'dormirJunto'
          : 'dormir',
    enter: (_s, from) => (from === 'Sleep' ? null : 'bocejar'),
    priority: PRIORITY.gesture,
    withProp: true,
    fillers: SLEEP_FILLERS,
    rate: () => 0.7,
  },
  {
    // BRINCAR COM A BOLA — e a bola tem de estar lá.
    //
    // A intenção `play` é a mesma para quatro brincadeiras: a bola largada no
    // chão, um amigo por perto, a mão do jogador e a chuva. Os três desenhos de
    // brincar têm uma bola dentro, então só a primeira delas pode usá-los. As
    // outras três caem nas regras de baixo — andando ela anda, parada e
    // brincalhona ela salta de alegria —, que é a verdade sem objeto nenhum.
    //
    // Sem esta condição um filhote recém-saído do ovo aparecia chutando uma
    // bola que o jogador nunca deu a ele: a marca `withProp` era uma promessa
    // que ninguém cobrava. Agora ela é cobrada aqui, no `when`.
    // A BOLA DO DESENHO SAIU: a que rola é a de verdade.
    //
    // As três tiras de brincar trazem uma bola desenhada, e o jardim já desenha
    // a bola dele — com física, sombra e quique. Ficavam duas na tela, e a
    // segunda não obedecia a nada. Agora estas tiras são recortadas na abertura
    // (ver `PROP_IN_THE_WORLD`) e sobra a criatura brincando; a bola é a que o
    // jogador largou. Andando, quem manda é a caminhada.
    state: 'PlayBall',
    when: (s) => s.intent === 'play' && s.ball && !s.moving,
    clip: (s) => (s.isBaby ? 'filhoteBrinca' : 'buscarBola'),
    priority: PRIORITY.gesture,
    withProp: true,
    fillers: BALL_FILLERS,
  },
  {
    // BRINCAR JUNTO — a segunda das quatro brincadeiras que `play` cobre, e a
    // única que precisava de alguém do lado para poder existir na tela. Sem bola
    // e com companhia é isto; sem bola e sozinha cai nas regras de baixo.
    state: 'PlayTogether',
    when: (s) => s.intent === 'play' && !s.ball && !s.moving && s.company !== COMPANY.alone,
    clip: () => 'brincarJunto',
    priority: PRIORITY.gesture,
    withProp: true,
    fillers: PLAY_FILLERS,
  },
  {
    // CUIDAR DE UM FILHOTE. Ninguém é obrigado a chegar perto de um: quem chega,
    // chegou porque quis — a empatia, o laço, o ninho comum. Mas quem está com
    // um filhote ao lado é desenhado com um filhote ao lado.
    // E CUIDAR É UM GESTO, NÃO UM ESTADO. A primeira versão pôs `limparFilhote`
    // como laço, e o teste de vivacidade mediu o estrago no mesmo minuto: 30%
    // da vida da criatura e treze segundos seguidos lavando o mesmo filhote.
    // Filhote anda atrás de adulto o tempo todo — estar perto de um é o normal,
    // não o acontecimento. O laço é ela DE OLHO nele; limpar, acariciar e
    // cheirar entram por cima, de vez em quando, que é como cuidado acontece.
    state: 'Tending',
    when: (s) => !s.moving && !s.isBaby && s.company === COMPANY.baby,
    // DOIS LAÇOS, e não um. Com `olharOutro` sozinho a tira chegou a 39% da
    // vida da criatura na medida de vivacidade — e ela ainda é filler do estado
    // social, então aparecia por dois caminhos ao mesmo tempo. Quem está
    // contente ao lado de um filhote não fica só olhando: fica derretido.
    clip: (s) => (s.happiness > 0.55 ? 'carinhoso' : 'olharOutro'),
    priority: PRIORITY.gesture,
    withProp: true,
    fillers: TENDING_FILLERS,
  },
  {
    // Ela para DIANTE da tela para aprender. Andando até lá, ela anda.
    state: 'Learn',
    when: (s) => s.intent === 'study' && !s.moving,
    clip: () => 'aprender',
    priority: PRIORITY.gesture,
    withProp: true,
    fillers: LEARN_FILLERS,
  },
  {
    state: 'Social',
    when: (s) => s.intent === 'socialize' || s.intent === 'follow',
    clip: (s) =>
      s.moving
        ? s.isBaby
          ? 'seguirMae'
          : 'seguirAmigo'
        : s.isBaby
          ? 'pedirColo'
          : // O DESAFETO. Parada ao lado de quem ela não suporta, ela não
            // conversa: vira a cara. É a mesma rixa que já existia no laço
            // social e que na tela era um bate-papo cordial.
            s.company === COMPANY.rival
            ? 'ignorar'
            : 'conversar',
    priority: PRIORITY.gesture,
    withProp: true,
    fillers: SOCIAL_FILLERS,
  },
  {
    // Cortejar é diante do par. A travessia do jardim até ele é caminhada.
    state: 'Courtship',
    when: (s) => s.intent === 'mate' && !s.moving,
    // Cortejar quem não quer nada é levar um fora, e o artista desenhou isso.
    clip: (s) => (s.company === COMPANY.rival ? 'rejeitar' : 'cortejar'),
    priority: PRIORITY.gesture,
    withProp: true,
    fillers: COURT_FILLERS,
  },
  {
    // Levando comida ela ANDA — e a comida continua desenhada, porque quem
    // desenha o que está na boca dela é o objeto, que existe no jardim.
    state: 'Carry',
    when: (s) => s.carrying && !s.moving,
    clip: () => 'segurarComida',
    priority: PRIORITY.gesture,
    withProp: true,
    fillers: CARRY_FILLERS,
  },
  {
    // Farejar é de nariz no chão, parada. Ir até o lugar é caminhada.
    state: 'Search',
    when: (s) => s.intent === 'search' && !s.moving,
    clip: () => 'farejar',
    priority: PRIORITY.gesture,
  },
  {
    // A INTERROGAÇÃO É UM INSTANTE, NÃO UM ESTADO.
    //
    // `curioso` tem um "?" desenhado no meio da tira, e ela era o LAÇO deste
    // estado. Resultado medido no jardim: observar era um quarto da vida da
    // criatura, e nesse quarto ela ficava com uma interrogação piscando em cima
    // da cabeça, sem parar, sem nunca chegar a conclusão nenhuma. É a cara de um
    // jogo travado, não de um bicho curioso.
    //
    // Um pensamento tem começo e fim: ela NOTA (o "?" aparece uma vez) e depois
    // fica olhando, virando a cabeça de um lado para o outro. `olharLados` não
    // tem marca nenhuma dentro, e é o que uma criatura acompanhando uma
    // borboleta faz com o corpo. As microanimações entram por cima disso.
    state: 'Curious',
    when: (s) => !s.moving && (s.intent === 'watch' || s.mood === MOOD.curious),
    clip: () => 'olharLados',
    enter: (_s, from) => (from === 'Curious' ? null : 'curioso'),
    priority: PRIORITY.gesture,
    fillers: THOUGHT_FILLERS,
  },
  {
    // SENTAR tem entrada e laço diferentes: primeiro ela se abaixa, depois
    // fica sentada. É a mesma ideia da freada, do outro lado do corpo.
    state: 'Sit',
    when: (s) => s.pose === POSE.sit,
    clip: () => 'descansar',
    enter: (_s, from) => (from === 'Sit' ? null : 'sentar'),
    priority: PRIORITY.gesture,
    fillers: IDLE_FILLERS,
  },
  {
    // O MANEIRISMO — uma regra só para os dezesseis gestos da tabela acima.
    // Andando ela não se coça: o corpo está ocupado com o passo.
    state: 'Pose',
    when: (s) => !s.moving && POSE_CLIP[s.pose] !== undefined,
    clip: (s) => POSE_CLIP[s.pose]!,
    // QUEM ACABOU DE CAIR PRIMEIRO SE LEVANTA. É a mesma ideia da freada ao
    // sair da corrida: o corpo não pode passar do ar para o gesto seguinte sem
    // o instante que liga os dois.
    enter: (_s, from) => (from === 'Falling' ? 'levantarQueda' : null),
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
                          ? 'muitoFeliz'
                          : // O FILHOTE PARADO FICA PARADO, e não com uma
                            // interrogação eterna na cabeça. `filhoteExplora`
                            // era o laço do filhote sem humor nenhum, e tem um
                            // "?" desenhado dentro: o bicho recém-nascido
                            // aparecia perguntando alguma coisa a vida toda. A
                            // tira é boa — virou microanimação, uma vez de vez
                            // em quando, que é o que um pensamento é.
                            'idle',
    enter: (_s, from) => (from === 'Run' ? 'frear' : null),
    priority: PRIORITY.idle,
    fillers: IDLE_FILLERS,
    rate: () => 1,
  },
];

/** Qual estado descreve esta criatura agora. */
export function stateFor(signals: CreatureSignals): StateRule {
  for (const rule of STATES) if (rule.when(signals)) return rule;
  return STATES[STATES.length - 1]!;
}

/**
 * TODOS OS REPERTÓRIOS, para o inventário poder contá-los.
 *
 * As microanimações são metade das tiras que o jogo mostra, e elas não saem de
 * nenhum `clip:` — entram por cima do laço. Sem esta lista, um teste que varre
 * a tabela conta pela metade.
 */
export const FILLER_SETS: readonly (readonly string[])[] = [
  IDLE_FILLERS,
  THOUGHT_FILLERS,
  FEAR_FILLERS,
  SCAR_FILLERS,
  PET_FILLERS,
  BALL_FILLERS,
  DRINK_FILLERS,
  HELD_FILLERS,
  CARRY_FILLERS,
  EAT_FILLERS,
  BATH_FILLERS,
  SLEEP_FILLERS,
  FIGHT_FILLERS,
  TENDING_FILLERS,
  PLAY_FILLERS,
  SICK_FILLERS,
  SOCIAL_FILLERS,
  COURT_FILLERS,
  LEARN_FILLERS,
];

/** Só para o inventário conferir os nomes do cortejo. */
export const COURT_FILLERS_TEST = COURT_FILLERS;

/** Segundos entre duas microanimações — sorteado dentro desta faixa. */
export const FILLER_GAP: readonly [number, number] = [2.5, 9];
