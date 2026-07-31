import { approach, clamp01, subjects } from '@core';
import { Transform, type System, type World } from '@engine';
import {
  Creature,
  Emotions,
  Memory,
  Mind,
  Needs,
  Personality,
  type Intent,
  type Mood,
} from '@creatures';
import { CreatureIndexResource } from '../creatureIndex';

/**
 * Inércia emocional.
 *
 * Nada muda de uma hora para outra: o medo leva muito tempo para passar, a
 * tristeza demora, a felicidade escorre devagar e a confiança se constrói aos
 * poucos. O trauma quase não cede — é o que dá peso às experiências ruins.
 */
/**
 * O medo cede devagar.
 *
 * Era 0,012 — um susto inteiro passava em oitenta segundos, e o jogador podia
 * bater numa criatura, esperar um minuto e meio e continuar de onde parou, com
 * ela mansa de novo. Um bicho não funciona assim. Em 0,007, o mesmo susto leva
 * uns dois minutos e meio para passar, e a criatura ainda passa um tempo
 * evitando quem a assustou.
 */
const FEAR_CALM = 0.007;
/** Acima deste trauma, o medo cede na marcha lenta: ele tem dono. */
const TRAUMA_HOLDS_FEAR = 0.25;
/** E sem trauma por trás, um susto passa tantas vezes mais depressa. */
const STARTLE_RECOVERY = 5;
/** Acima deste trauma, e só acima dele, a cicatriz começa a se formar. */
const SCAR_AT = 0.45;
/** O quanto a cicatriz cresce por segundo de trauma alto. */
const SCAR_RATE = 0.0025;
/** E o teto dela: nem a pior das vidas apaga a criatura inteira. */
const MAX_SCAR = 0.7;
/** O quanto ela cede por segundo de vida boa — dez vezes mais devagar. */
const SCAR_HEAL = 0.00025;
/** Quanto medo de base uma cicatriz sustenta, para sempre. */
const SCAR_FEAR = 0.5;
const ANGER_CALM = 0.02;
const STRESS_CALM = 0.01;
const HAPPINESS_INERTIA = 0.035;
const TRAUMA_CALM = 0.0006;
/** A dor sara sozinha: some por volta de dois minutos. */
const PAIN_HEAL = 0.009;

const SLEEP_RATE = 0.012;
const WAKE_RATE = 0.16;
const LONELINESS_RATE = 0.02;

/**
 * DE QUÃO PERTO A COMPANHIA CONTA.
 *
 * Perto de verdade: dois bichos ao alcance da vista não estão juntos, estão no
 * mesmo jardim. Este raio é o de um grupo — quem está aqui dentro divide a
 * sombra da mesma árvore.
 */
const CROWD_RANGE = 110;
/** Quantos vizinhos já são companhia suficiente. */
const CROWD_ENOUGH = 3;
/** O quanto a solidão cede por segundo, cercada. */
const CROWD_EASE = 0.05;
/**
 * E até onde ela cede só de ter gente por perto.
 *
 * Não até zero. Estar no meio de um grupo tira o desespero; o resto — deixar de
 * estar só — vem de conversar, dividir comida, brincar junto. Se a presença
 * zerasse a solidão, a criatura nunca mais procuraria ninguém, e o convívio
 * inteiro do jogo deixaria de acontecer.
 */
const CROWD_FLOOR = 0.25;

/**
 * A INÉRCIA DA CURIOSIDADE.
 *
 * Nem instantânea nem lenta: a criatura leva uns vinte segundos para se dar
 * conta de que aquele canto já não tem nada de novo. Instantâneo faria a
 * vontade piscar a cada passo entre duas casas do mapa.
 */
const CURIOSITY_TURN = 0.05;
/**
 * Quanto do temperamento sobra num lugar que ela nunca viu: ali ela fica.
 *
 * Oito décimos, e não metade. Meio foi a primeira tentativa, e o efeito colateral
 * apareceu num teste de história: um bicho faminto levava 187 segundos para
 * roubar a fruta do vizinho a quarenta pixels, contra menos de noventa antes.
 * O mundo inteiro começa desconhecido — cortar a curiosidade pela metade ali é
 * deixar o jardim todo lerdo justamente na abertura. A novidade tem de fazer a
 * criatura DEMORAR num lugar, não ficar apática.
 */
const FAMILIAR_FLOOR = 0.8;
/** E quanto ele passa do normal no quintal de sempre: dali ela quer sair. */
const FAMILIAR_ITCH = 0.35;
/**
 * E O QUANTO UM LUGAR VIRA CONHECIDO, por segundo de permanência.
 *
 * Uns cinquenta segundos até um canto virar quintal. É devagar de propósito:
 * a oito centésimos, que foi a primeira tentativa, um lugar desconhecido
 * deixava de ser desconhecido em doze segundos, e aí "novidade" não durava o
 * suficiente para mudar o comportamento de ninguém — medido, um canto novo e um
 * canto de sempre davam exatamente a mesma inquietação.
 *
 * O que faz o traço sobreviver não é a velocidade e sim o `FIRST_VISIT` da
 * memória: antes dele, um lugar novo nascia abaixo do piso do esquecimento e
 * era apagado no mesmo quadro em que nascia.
 */
const FAMILIARITY_RATE = 0.02;

/** Quantos vizinhos ela tem ao redor agora. */
const around: number[] = [];
function companyNear(world: World, self: number): number {
  if (!world.hasResource(CreatureIndexResource)) return 0;
  const here = world.store(Transform).get(self);
  if (!here) return 0;
  around.length = 0;
  world.getResource(CreatureIndexResource).query(here.x, here.y, CROWD_RANGE, around);
  let count = 0;
  for (const other of around) if (other !== self) count += 1;
  return count;
}

export const emotionSystem: System = {
  name: 'emotion',
  update(world, dt) {
    const creatures = world.store(Creature);
    const emotionsStore = world.store(Emotions);
    const needsStore = world.store(Needs);
    const traitsStore = world.store(Personality);
    const minds = world.store(Mind);
    const memories = world.store(Memory);

    creatures.forEach((_tag, entity) => {
      const emotions = emotionsStore.get(entity);
      const needs = needsStore.get(entity);
      const traits = traitsStore.get(entity);
      const mind = minds.get(entity);
      if (!emotions || !needs || !traits || !mind) return;

      const sleeping = mind.intent === 'sleep';

      // A dor aguda passa em alguns minutos — o corpo sara. O que não passa
      // junto é o trauma: a marca de ter apanhado fica muito depois de parar
      // de doer.
      emotions.pain = Math.max(0, emotions.pain - PAIN_HEAL * dt);

      // A CICATRIZ SE FORMA COM O TEMPO, NÃO COM O GOLPE.
      //
      // Enquanto o trauma fica lá em cima, alguma coisa vai ficando permanente.
      // Um susto passa; viver assustada não. É por isso que a marca cresce por
      // SEGUNDO de trauma alto, e não por pancada levada: o que adoece uma
      // criatura não é o pior dia dela, é o tanto de dias ruins.
      if (emotions.trauma > SCAR_AT) {
        emotions.scar = Math.min(MAX_SCAR, emotions.scar + SCAR_RATE * dt);
      }

      // E cede — mas devagar como nada mais no jogo cede: só quando ela está
      // bem, confiando e sem trauma novo. São horas de jardim para apagar o
      // que uma tarde de maus-tratos escreveu, e nunca até o fim. Uma criatura
      // marcada pode voltar a confiar; ela só não volta a ser a de antes.
      //
      // A condição é "não aconteceu mais nada": trauma parado no fundo do
      // poço, ou seja, na própria cicatriz. Comparar com um valor absoluto não
      // funcionava — a cicatriz é o piso do trauma, então uma criatura muito
      // marcada nunca teria trauma baixo o bastante para se curar, e a cura
      // era um caminho morto no código.
      const calm = emotions.trauma <= emotions.scar + 0.02;
      if (calm && emotions.happiness > 0.6 && emotions.trust > 0.5) {
        emotions.scar = Math.max(0, emotions.scar - SCAR_HEAL * dt);
      }

      // O trauma sustenta um piso de medo: quem sofreu não volta ao normal. E
      // ele não desce até zero: desce até a cicatriz.
      emotions.trauma = Math.max(emotions.scar, emotions.trauma - TRAUMA_CALM * dt);
      // Doendo, o medo não cede: é difícil relaxar machucada.
      const fearFloor = Math.max(
        emotions.trauma * 0.45,
        emotions.scar * SCAR_FEAR,
        emotions.pain * 0.5,
      );
      // O MEDO SEM TRAUMA PASSA; O MEDO COM TRAUMA É O QUE FICA.
      //
      // A taxa lenta foi escrita para a pancada, e está certa para ela: quem
      // apanha fica arisco por bastante tempo, e não adianta esperar um minuto
      // para continuar de onde parou. Mas ela valia para TODO susto, e um susto
      // qualquer — ser pega no colo, levar um chacoalhão, ver a mão chegar
      // depressa — condenava a criatura a dois minutos e meio de pavor. O
      // jogador via um bicho preso num medo que não tinha causa visível.
      //
      // Quem separa os dois casos é o trauma: sem ele por trás, o susto é só um
      // susto e cede várias vezes mais depressa. É a diferença entre levar um
      // susto e ter medo de alguém.
      const scarred = emotions.trauma > TRAUMA_HOLDS_FEAR;
      emotions.fear = Math.max(
        fearFloor,
        approach(
          emotions.fear,
          fearFloor,
          FEAR_CALM * (0.6 + traits.bravery) * (scarred ? 1 : STARTLE_RECOVERY),
          dt,
        ),
      );

      emotions.anger = approach(
        emotions.anger,
        0,
        ANGER_CALM * (1.3 - traits.aggression * 0.6),
        dt,
      );
      emotions.stress = approach(emotions.stress, emotions.trauma * 0.3, STRESS_CALM, dt);

      // Trauma atrapalha o sono: descansa pior e acorda mais cansada.
      const restQuality = 1 - emotions.trauma * 0.5;
      emotions.sleepiness = clamp01(
        emotions.sleepiness +
          (sleeping ? -WAKE_RATE * restQuality : SLEEP_RATE * (1.3 - traits.activity * 0.6)) * dt,
      );

      // A SOLIDÃO CEDE COM COMPANHIA — e não só com um ato de socializar.
      //
      // Antes ela só subia aqui, e só descia quando a criatura executava alguma
      // coisa: conversar, dividir comida, receber carinho, fazer as pazes. O
      // resultado era um bicho cercado de quinze vizinhos, encostando neles,
      // dormindo do lado deles, e SOZINHO — o jogador viu isso e perguntou por
      // quê. Estar acompanhado não é uma ação: é um estado, e é assim que a
      // solidão funciona em qualquer bicho social.
      //
      // Não zera: companhia sem convívio alivia, não preenche. A criatura ainda
      // precisa conversar, brincar e dividir para chegar ao fundo — o que muda
      // é que ela deixa de estar desesperada de solidão no meio de um grupo.
      const perto = companyNear(world, entity);
      emotions.loneliness = clamp01(
        perto > 0
          ? Math.max(
              CROWD_FLOOR,
              emotions.loneliness - CROWD_EASE * Math.min(1, perto / CROWD_ENOUGH) * dt,
            )
          : emotions.loneliness + LONELINESS_RATE * traits.sociability * dt,
      );

      // A CURIOSIDADE VEM DE JÁ CONHECER O LUGAR ONDE SE ESTÁ.
      //
      // Antes ela era um espelho do temperamento: um valor que perseguia
      // `traits.curiosity` e ficava lá a vida inteira. Uma criatura curiosa era
      // permanentemente curiosa e nada do que acontecia no mundo mexia nisso —
      // não é uma emoção, é uma segunda cópia de um gene.
      //
      // A primeira tentativa foi um tanque: enche sozinho, esvazia no
      // desconhecido. Medido no jardim, ficou preso em zero — andar já é estar
      // em lugar pouco conhecido, então o dreno vencia o enchimento o tempo
      // todo e a criatura nunca ficava curiosa. Um tanque que nunca enche é
      // pior que a versão anterior: apaga a exploração em vez de causá-la.
      //
      // O que funciona é ler o mundo em vez de contar o tempo: ela fica
      // inquieta onde JÁ CONHECE, e se aquieta onde é novidade. No quintal de
      // sempre a curiosidade sobe até o teto do temperamento dela e a empurra
      // para fora; chegando a um canto que nunca viu, cai — e ela fica ali,
      // olhando em volta, até aquilo também virar quintal.
      const here = world.store(Transform).get(entity);
      const memory = memories.get(entity);
      const spot = here ? subjects.place(here.x, here.y) : null;
      const familiar = spot && memory ? memory.familiarityOf(spot) : 1;
      emotions.curiosity = approach(
        emotions.curiosity,
        // Medo e barriga vazia fecham a cabeça: ninguém explora fugindo.
        // A FAMILIARIDADE MODULA, NÃO ZERA. A primeira versão multiplicava o
        // gene pela familiaridade direto, e a medição mostrou o estrago: o gene
        // de curiosidade do jardim está em 0,22 na média, a familiaridade típica
        // em 0,3, e o produto dava 0,05 — menos que a versão antiga, que era
        // 0,15. Uma mudança que se propunha a causar exploração estava
        // apagando-a. Aqui ela vira um balanço em volta do temperamento: no
        // canto desconhecido, meio; no quintal de sempre, um terço a mais.
        clamp01(
          traits.curiosity *
            (FAMILIAR_FLOOR + (1 - FAMILIAR_FLOOR + FAMILIAR_ITCH) * familiar) *
            (1 - emotions.fear) *
            (1 - needs.hunger * 0.6),
        ),
        CURIOSITY_TURN,
        dt,
      );

      // E O MAPA SE DESENHA ANDANDO. Estar num lugar torna aquele lugar
      // conhecido, depressa. Não é uma opinião sobre ele — é só saber que
      // existe, que é o que separa o quintal do mundo lá fora, e é o que faz o
      // território aparecer sem ninguém desenhar território.
      if (spot && memory && !sleeping) memory.visit(spot, FAMILIARITY_RATE * dt);

      // Felicidade: síntese do bem-estar, mas com inércia — não pula de valor.
      const comfort =
        (1 - needs.hunger) * 0.25 +
        (1 - needs.thirst) * 0.2 +
        needs.energy * 0.15 +
        needs.health * 0.2 +
        emotions.trust * 0.1 +
        (1 - emotions.loneliness) * 0.1;
      const distress =
        emotions.fear * 0.5 + emotions.stress * 0.4 + emotions.anger * 0.2 + emotions.trauma * 0.3;
      emotions.happiness = approach(
        emotions.happiness,
        clamp01(comfort - distress),
        HAPPINESS_INERTIA,
        dt,
      );

      mind.affection = Math.max(0, mind.affection - dt);
      mind.surprise = Math.max(0, mind.surprise - dt);
      mind.attention = Math.max(0, mind.attention - dt);

      mind.mood = pickMood(emotions, needs, mind);

      memories.get(entity)?.decay(dt);
    });
  },
};

/**
 * Ordem de prioridade: momentos marcantes vencem estados de fundo, e o que a
 * criatura está *fazendo* aparece no rosto tanto quanto o que ela sente.
 */
function pickMood(
  emotions: Emotions,
  needs: Needs,
  mind: { affection: number; surprise: number; attention: number; intent: Intent },
): Mood {
  if (mind.affection > 0) return 'loved';
  if (mind.intent === 'sleep') return 'sleepy';
  if (mind.surprise > 0) return 'surprised';
  if (emotions.fear > 0.45) return 'afraid';
  if (emotions.anger > 0.5) return 'angry';
  if (mind.intent === 'play' || mind.intent === 'mate') return 'playful';
  if (mind.intent === 'seekWater' || needs.thirst > 0.75) return 'thirsty';
  if (mind.intent === 'seekFood' || needs.hunger > 0.75) return 'hungry';
  if (mind.attention > 0 || mind.intent === 'study') return 'curious';
  if (emotions.happiness > 0.68) return 'happy';
  if (emotions.loneliness > 0.7 && emotions.happiness < 0.55) return 'needy';
  if (emotions.happiness < 0.3 || emotions.stress > 0.55) return 'sad';
  if (emotions.sleepiness > 0.7) return 'sleepy';
  if (emotions.curiosity > 0.7) return 'curious';
  return 'neutral';
}
