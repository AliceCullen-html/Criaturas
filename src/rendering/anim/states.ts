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
 * E é AQUI que moram as tiras com marca de pensamento — a interrogação, o balão.
 * Uma marca dura o tempo de uma ideia: como microanimação ela aparece, some e
 * volta mais tarde. Como laço de estado ela nunca sai da cabeça da criatura, e
 * foi o que aconteceu duas vezes (observando e no ocioso do filhote).
 */
export const IDLE_FILLERS: readonly string[] = [
  'piscar',
  'olharLados',
  'olharCima',
  'olharBaixo',
  'bocejar',
  'espreguicar',
  'farejar',
  'curioso',
  'pensar',
  'filhoteExplora',
  'confuso',
  'entediado',
];

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
 * O REPERTÓRIO DE QUEM ESTÁ DOENTE — tosse, espirro, febre, tremor.
 *
 * Doente ela ficava no laço de `doente`, treze segundos seguidos na medida. Uma
 * criatura adoentada não fica quieta: ela tosse, espirra, arde de febre. E são
 * essas coisas pequenas que dizem ao jogador que ela precisa de cuidado — um
 * laço parado não pede nada a ninguém.
 */
const SICK_FILLERS: readonly string[] = ['tossir', 'espirrar', 'febre', 'tremer'];

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
    fillers: FEAR_FILLERS,
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
  },
  {
    state: 'Pet',
    when: (s) => s.touched,
    clip: () => 'afagar',
    priority: PRIORITY.interaction,
    withProp: true,
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
    state: 'Eat',
    when: (s) => s.pose === POSE.eat || (s.intent === 'seekFood' && !s.moving),
    clip: (s) => (s.pose === POSE.eat ? 'mastigar' : s.isBaby ? 'pedirComida' : 'procurarComida'),
    enter: (s) => (s.pose === POSE.eat ? 'pegarComida' : null),
    priority: PRIORITY.gesture,
    withProp: true,
  },
  {
    // Beber é de boca na água. O caminho até o lago é caminhada.
    state: 'Drink',
    when: (s) => s.intent === 'seekWater' && !s.moving,
    clip: () => 'beber',
    priority: PRIORITY.gesture,
    withProp: true,
  },
  {
    // Ela VAI para o ninho antes de dormir, e no caminho ela anda — devagar,
    // porque a caminhada já conta o cansaço no ritmo do passo.
    state: 'Sleep',
    when: (s) => (s.intent === 'sleep' && !s.moving) || s.pose === POSE.lie,
    clip: (s) => (s.isBaby ? 'filhoteDorme' : 'dormir'),
    enter: (_s, from) => (from === 'Sleep' ? null : 'bocejar'),
    priority: PRIORITY.gesture,
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
    state: 'PlayBall',
    when: (s) => s.intent === 'play' && s.ball,
    clip: (s) => (s.moving ? 'buscarBola' : s.isBaby ? 'filhoteBrinca' : 'chutarBola'),
    priority: PRIORITY.gesture,
    withProp: true,
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
      s.moving ? (s.isBaby ? 'seguirMae' : 'seguirAmigo') : s.isBaby ? 'pedirColo' : 'conversar',
    priority: PRIORITY.gesture,
    withProp: true,
  },
  {
    // Cortejar é diante do par. A travessia do jardim até ele é caminhada.
    state: 'Courtship',
    when: (s) => s.intent === 'mate' && !s.moving,
    clip: () => 'cortejar',
    priority: PRIORITY.gesture,
    withProp: true,
  },
  {
    // Levando comida ela ANDA — e a comida continua desenhada, porque quem
    // desenha o que está na boca dela é o objeto, que existe no jardim.
    state: 'Carry',
    when: (s) => s.carrying && !s.moving,
    clip: () => 'segurarComida',
    priority: PRIORITY.gesture,
    withProp: true,
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
    fillers: IDLE_FILLERS,
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

/** Segundos entre duas microanimações — sorteado dentro desta faixa. */
export const FILLER_GAP: readonly [number, number] = [2.5, 9];
