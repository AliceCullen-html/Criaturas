import { KNOWN, WORD, WORD_COUNT, WORD_TEXT, clamp01, subjects, type Lexicon } from '@core';
import { Transform, defineComponent, defineResource, type System, type World } from '@engine';
import { Bio, Creature, Emotions, Identity, Memory, Mind, Needs, Words } from '@creatures';
import { SceneryResource, type SceneryPiece } from '@world';
import { CreatureIndexResource } from '../creatureIndex';
import { chronicle } from '../chronicle';
import { isBaby } from '../age';

/**
 * O ENSINO.
 *
 * Este é o sistema que responde à parte mais difícil do projeto: *como se
 * ensina alguma coisa a um bicho que ninguém programou para obedecer?*
 *
 * A resposta é a mesma da vida real — **associação e repetição**. Não existe
 * comando "aprender". Existe uma máquina que mostra uma palavra, existe a sua
 * mão mostrando um objeto e dizendo o nome dele, e existe a criatura ali, com
 * atenção suficiente para ligar as duas coisas. Se ela estiver com fome, com
 * medo ou com sono, não aprende nada — exatamente como não se ensina nada a uma
 * criança faminta. Cuidar é pré-requisito de ensinar, e essa dependência é
 * deliberada: é ela que faz o jogo ser sobre uma relação e não sobre um menu.
 *
 * Três caminhos levam uma palavra à cabeça de alguém:
 *
 * 1. **O computador.** A máquina do jardim mostra uma palavra por vez para quem
 *    estiver parado na frente dela. É lento e é a fonte original — antes do
 *    primeiro aprendiz, ninguém tem o que dizer.
 * 2. **Você.** Segurar uma fruta diante de uma criatura que está olhando é
 *    nomear a fruta para ela. É o ensino mais rápido do jogo, e o único que
 *    exige a sua presença.
 * 3. **Elas.** Quem sabe uma palavra a repete para quem está por perto. É assim
 *    que o conhecimento deixa de ser de um indivíduo e vira da espécie.
 *
 * E a palavra CARREGA COISA JUNTO. Quando duas criaturas compartilham a palavra
 * "fruta", quem sabe que certo fruto faz mal passa esse aviso adiante; com
 * "perigo", passa-se o lugar onde algo ruim aconteceu; com "você", passa-se a
 * opinião sobre o jogador. É por isso que valeu a pena existir linguagem: uma
 * criatura que nunca comeu o cogumelo venenoso pode saber que ele é ruim, e a
 * sua reputação corre o jardim sem você tocar em ninguém.
 */

/** Uma palavra dita em voz alta — o renderer transforma isso numa bolha. */
export interface Utterance {
  speaker: number;
  word: number;
  /** Alguém a quem foi dita, ou -1 se falou sozinha. */
  to: number;
}

/**
 * A fila do que foi dito.
 *
 * Quem esvazia é quem MOSTRA — a camada de apresentação recolhe as falas e as
 * transforma em bolhas na tela. A simulação nunca sabe que existe uma bolha:
 * ela só registra que uma criatura disse uma palavra, e isso continua verdade
 * mesmo num teste sem tela nenhuma.
 */
export const SpeechResource = defineResource<Utterance[]>('Speech');

/** Ritmo da fala de cada criatura. */
export interface Chatter {
  /** Segundos até poder ensinar uma palavra a alguém de novo. */
  cooldown: number;
  /** Segundos até poder falar sozinha de novo (dizer o que está fazendo). */
  voice: number;
  /** A última intenção anunciada — para não repetir a mesma palavra sem parar. */
  spoke: string;
}
export const Chatter = defineComponent<Chatter>('Chatter');

/** Até onde a tela do computador é legível. */
const STUDY_RANGE = 78;
/** Quanto tempo cada palavra fica na tela. */
const WORD_SECONDS = 5;
/**
 * Domínio ganho por segundo de estudo.
 *
 * Uma palavra custa 0,6 para virar conhecimento, então são uns doze segundos de
 * atenção plena — e bem mais na prática, porque nenhuma criatura fica parada
 * doze segundos seguidos olhando para uma tela.
 */
const STUDY_RATE = 0.05;
/** Uma lição sua: mostrar o objeto e dizer o nome. */
const LESSON_GIFT = 0.15;
/**
 * O que se ganha ouvindo outra criatura repetir a palavra.
 *
 * Meia dúzia de repetições fecham uma palavra — uns trinta segundos de
 * companhia. Parece rápido escrito assim, e é lentíssimo no jardim: duas
 * criaturas raramente ficam meio minuto lado a lado sem que uma delas fique com
 * fome, com sede ou com vontade de ir a outro lugar.
 */
const SPREAD_GIFT = 0.1;
/**
 * A que distância uma criatura ouve a outra.
 *
 * Três corpos de distância. Voz alcança mais que toque, e é bom que alcance:
 * com o alcance curto demais só aprendia quem estivesse encostado, e duas
 * criaturas quase nunca ficam encostadas por meio minuto.
 */
const SPEAK_RANGE = 70;
/** Segundos entre duas falas da mesma criatura. */
const SPEAK_EVERY = 5;
/** Acima disto ela tem problema próprio e não está aprendendo nada. */
const BUSY_HUNGER = 0.6;
const BUSY_THIRST = 0.6;
const BUSY_FEAR = 0.4;
/** Filhote aprende mais rápido — é o que a fase de filhote É. */
const BABY_BONUS = 1.5;
/** O quanto a conversa transfere do que o falante sabe sobre o assunto. */
const HEARSAY = 0.35;

/** Segundos entre duas falas espontâneas da mesma criatura. */
/**
 * DE QUANTO EM QUANTO TEMPO UMA CRIATURA FALA SOZINHA.
 *
 * Eram nove segundos, e o defeito é o mesmo da interrogação infinita: a
 * cadência é POR CRIATURA, mas quem olha vê o jardim inteiro. Com cinquenta
 * bichos, nove segundos cada dá cinco balões por segundo na tela — e como cada
 * um vive pouco mais de dois, o jardim vira um pisca-pisca de palavras que
 * ninguém consegue ler. O jogador descreveu exatamente isso: "aparecem e somem
 * bem rápido, parece tudo acelerado".
 *
 * Vinte e oito segundos põem o jardim cheio em menos de dois balões por
 * segundo, espalhados por cinquenta cabeças diferentes. Uma criatura sozinha
 * continua falando o bastante para o jogador saber que ela fala.
 */
const VOICE_EVERY = 28;

/**
 * A palavra que cada intenção pede.
 *
 * Nem toda intenção tem uma: "vagar" e "brincar" não são coisas que este
 * vocabulário nomeia, e inventar uma palavra para elas seria pôr a criatura
 * dizendo o que ela não sabe dizer.
 */
const WORD_FOR_INTENT: Record<string, number | undefined> = {
  seekWater: WORD.water,
  seekFood: WORD.food,
  sleep: WORD.sleep,
  flee: WORD.danger,
  approachPlayer: WORD.player,
  follow: WORD.friend,
  socialize: WORD.friend,
  shelter: WORD.tree,
  mate: WORD.baby,
};

const nearby: number[] = [];

/** A máquina do jardim, se houver alguma. */
export function findComputer(scenery: readonly SceneryPiece[]): SceneryPiece | null {
  for (const piece of scenery) if (piece.kind === 'computer') return piece;
  return null;
}

/**
 * Ela consegue prestar atenção agora?
 *
 * A régua é a mesma para as três formas de ensinar, porque a limitação não é do
 * método: é do estado dela. Aprender é o que um corpo faz quando não está
 * ocupado em continuar vivo.
 */
function canLearn(needs: Needs, emotions: Emotions, mind: Mind): boolean {
  if (mind.intent === 'sleep' || mind.intent === 'flee' || mind.intent === 'attack') return false;
  return (
    needs.hunger < BUSY_HUNGER &&
    needs.thirst < BUSY_THIRST &&
    emotions.fear < BUSY_FEAR &&
    emotions.pain < 0.25 &&
    needs.energy > 0.2
  );
}

/** O quanto esta cabeça absorve, de 0 a ~2. */
function focusOf(emotions: Emotions, baby: boolean): number {
  return (0.45 + emotions.curiosity * 0.85) * (1 - emotions.stress * 0.5) * (baby ? BABY_BONUS : 1);
}

/**
 * A criatura já viveu aquilo de que a palavra fala?
 *
 * Uma palavra pendurada em coisa nenhuma é ruído. Quem já comeu fruta aprende
 * "fruta" com o dobro da facilidade de quem nunca viu uma, porque para ela a
 * palavra tem onde grudar. É o que faz o ensino depender do cuidado: as
 * criaturas que você alimentou e com quem conviveu aprendem mais rápido.
 */
function familiarityOf(world: World, id: number, word: number): number {
  const memory = world.store(Memory).get(id);
  if (!memory) return 1;
  let known = false;
  switch (word) {
    case WORD.food:
      memory.forEachAbout('food:', () => {
        known = true;
      });
      break;
    case WORD.player:
      known = memory.knows(subjects.player());
      break;
    case WORD.friend:
      memory.forEachAbout('creature:', () => {
        known = true;
      });
      break;
    default:
      // Água, árvore, pedra, casa: coisas que qualquer criatura do jardim já
      // viu por viver nele. Não há como não ter esbarrado numa árvore.
      known = true;
  }
  return known ? 1 : 0.5;
}

/**
 * Ensina uma palavra a alguém. É a porta única — o computador, a sua mão e as
 * outras criaturas entram todos por aqui.
 *
 * Devolve `true` se foi esta lição que fez a palavra virar conhecimento.
 */
export function teachWord(world: World, id: number, word: number, amount: number): boolean {
  const lexicon = world.store(Words).get(id);
  const needs = world.store(Needs).get(id);
  const emotions = world.store(Emotions).get(id);
  const mind = world.store(Mind).get(id);
  if (!lexicon || !needs || !emotions || !mind) return false;
  if (!canLearn(needs, emotions, mind)) return false;

  const bio = world.store(Bio).get(id);
  const focus = focusOf(emotions, bio ? isBaby(bio) : false);
  const learned = lexicon.hear(word, amount * focus * familiarityOf(world, id, word));
  if (!learned) return false;

  // A palavra que acabou de entrar sai na hora pela boca. É o instante mais
  // importante do sistema inteiro e o único jeito de o jogador saber que
  // aconteceu: sem isto, aprender é um número subindo em silêncio.
  say(world, id, word);

  // Aprender uma palavra é uma alegria, e fica na memória como um dia bom.
  emotions.happiness = clamp01(emotions.happiness + 0.12);
  emotions.curiosity = clamp01(emotions.curiosity + 0.08);
  const transform = world.store(Transform).get(id);
  world
    .store(Memory)
    .get(id)
    ?.addEpisode({
      text: `Aprendi a palavra "${WORD_TEXT[word]}"`,
      valence: 0.7,
      intensity: 0.6,
      emotion: 'descoberta',
      tick: world.tick,
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
    });

  const name = world.store(Identity).get(id)?.name ?? '?';
  chronicle(
    world,
    'primeira-palavra',
    `${name} aprendeu a primeira palavra da espécie: "${WORD_TEXT[word]}"`,
    true,
  );
  chronicle(world, `palavra-${id}-${word}`, `${name} aprendeu a dizer "${WORD_TEXT[word]}"`);
  if (lexicon.size >= WORD_COUNT) {
    chronicle(
      world,
      'vocabulario-completo',
      `${name} aprendeu a dizer tudo o que há para dizer`,
      true,
    );
  }
  return true;
}

/**
 * VOCÊ ENSINANDO.
 *
 * Segurar a fruta diante dela e dizer o nome. É a lição mais forte do jogo — e
 * a única que exige a sua presença — mas ela só vale se a criatura estiver
 * OLHANDO. Mostrar uma fruta para quem está de costas não ensina nada, aqui
 * como em qualquer lugar; e é isso que transforma "clicar num botão de ensinar"
 * em "conseguir a atenção de um bicho", que é uma coisa completamente
 * diferente e muito melhor.
 *
 * Devolve o que aconteceu, porque o jogo precisa MOSTRAR: quem aprendeu ganha
 * uma bolha com a palavra, quem não estava prestando atenção ganha nada, e o
 * jogador entende sozinho que precisa chamar antes de ensinar.
 */
export type LessonReply = 'learned' | 'listening' | 'distracted';

export function showAndTell(world: World, id: number, word: number): LessonReply {
  const mind = world.store(Mind).get(id);
  const needs = world.store(Needs).get(id);
  const emotions = world.store(Emotions).get(id);
  if (!mind || !needs || !emotions) return 'distracted';
  // Olhando para a sua mão, ou derretida de carinho: os dois jeitos de uma
  // criatura estar com a atenção em você.
  if (mind.attention <= 0 && mind.affection <= 0) return 'distracted';
  if (!canLearn(needs, emotions, mind)) return 'distracted';

  const learned = teachWord(world, id, word, LESSON_GIFT);
  say(world, id, word);
  return learned ? 'learned' : 'listening';
}

/** Registra a fala para o mundo ver (bolha na tela, gesto de conversa). */
function say(world: World, speaker: number, word: number, to = -1): void {
  if (!world.hasResource(SpeechResource)) return;
  const said = world.getResource(SpeechResource);
  if (said.length > 24) return;
  said.push({ speaker, word, to });
}

/**
 * O que a palavra carrega junto quando duas criaturas a compartilham.
 *
 * Este é o momento em que a linguagem deixa de ser enfeite. Sem ele, saber
 * "fruta" seria um adorno na ficha; com ele, uma criatura que nunca passou mal
 * pode recusar o cogumelo porque ALGUÉM lhe contou.
 */
function passOn(world: World, from: number, to: number, word: number): void {
  const source = world.store(Memory).get(from);
  const target = world.store(Memory).get(to);
  if (!source || !target) return;

  if (word === WORD.food) {
    source.forEachAbout('food:', (subject, trace) => {
      target.record(subject, trace.valence, trace.strength * HEARSAY);
    });
  } else if (word === WORD.danger) {
    // Só o que é ruim: ninguém atravessa o jardim para avisar que um lugar é
    // agradável. O medo é o que se conta.
    source.forEachAbout('place:', (subject, trace) => {
      if (trace.valence < -0.2) target.record(subject, trace.valence, trace.strength * HEARSAY);
    });
  } else if (word === WORD.player) {
    // A sua reputação. Maltrate uma criatura na frente das outras e o jardim
    // inteiro fica sabendo — mesmo quem nunca encostou em você.
    const opinion = source.valenceOf(subjects.player());
    if (Math.abs(opinion) > 0.1) target.record(subjects.player(), opinion, HEARSAY * 0.6);
  }
}

export const teachingSystem: System = {
  name: 'teaching',
  update(world, dt) {
    const creatures = world.store(Creature);
    if (creatures.size === 0) return;
    const wordsStore = world.store(Words);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const minds = world.store(Mind);
    const transforms = world.store(Transform);
    const chatters = world.store(Chatter);
    const bios = world.store(Bio);

    // ---- O computador ----------------------------------------------------
    const machine = world.hasResource(SceneryResource)
      ? findComputer(world.getResource(SceneryResource))
      : null;

    if (machine) {
      // Quem está diante da tela. A máquina não chama ninguém: ela só está
      // ligada, e quem se aproximou aprende.
      const students: number[] = [];
      creatures.forEach((_tag, entity) => {
        const here = transforms.get(entity);
        if (!here) return;
        if (Math.hypot(here.x - machine.x, here.y - machine.y) > STUDY_RANGE) return;
        const needs = needsStore.get(entity);
        const emotions = emotionsStore.get(entity);
        const mind = minds.get(entity);
        if (!needs || !emotions || !mind || !canLearn(needs, emotions, mind)) return;
        students.push(entity);
      });

      if (students.length === 0) {
        // Ninguém olhando: a tela vai apagando. Não apaga de uma vez porque o
        // jogador também acende a máquina cutucando-a, e um clique que não
        // mostra nada é um clique que não ensina nada a ele.
        machine.wordTimer = Math.max(0, machine.wordTimer - dt);
      } else {
        machine.wordTimer -= dt;
        if (machine.wordTimer <= 0) {
          machine.wordTimer = WORD_SECONDS;
          machine.word = nextLesson(wordsStore, students, machine.word);
        }
        for (const student of students) {
          // Quem veio de propósito aprende mais que quem passou na frente.
          const deliberate = minds.get(student)?.intent === 'study' ? 1.6 : 0.7;
          teachWord(world, student, machine.word, STUDY_RATE * deliberate * dt);
        }
      }
    }

    // ---- A palavra corre entre elas --------------------------------------
    const index = world.hasResource(CreatureIndexResource)
      ? world.getResource(CreatureIndexResource)
      : null;

    creatures.forEach((_tag, speaker) => {
      const lexicon = wordsStore.get(speaker);
      if (!lexicon || lexicon.size === 0) return;

      let chatter = chatters.get(speaker);
      if (!chatter) {
        chatter = { cooldown: SPEAK_EVERY, voice: 0, spoke: '' };
        chatters.set(speaker, chatter);
      }
      chatter.cooldown -= dt;
      if (chatter.cooldown > 0) return;

      const here = transforms.get(speaker);
      const needs = needsStore.get(speaker);
      const emotions = emotionsStore.get(speaker);
      const mind = minds.get(speaker);
      if (!here || !needs || !emotions || !mind) return;
      if (!canLearn(needs, emotions, mind)) return;

      // Quem escuta.
      nearby.length = 0;
      if (index) index.query(here.x, here.y, SPEAK_RANGE, nearby);
      else creatures.forEach((_t, other) => nearby.push(other));

      for (const listener of nearby) {
        if (listener === speaker) continue;
        const there = transforms.get(listener);
        const theirWords = wordsStore.get(listener);
        if (!there || !theirWords) continue;
        if (Math.hypot(there.x - here.x, there.y - here.y) > SPEAK_RANGE) continue;

        const word = lexicon.somethingToTeach(theirWords);
        if (word >= 0) {
          const before = theirWords.graspOf(word);
          teachWord(world, listener, word, SPREAD_GIFT);
          say(world, speaker, word, listener);
          chatter.cooldown = SPEAK_EVERY;
          if (theirWords.graspOf(word) >= KNOWN && before < KNOWN) {
            const teacher = world.store(Identity).get(speaker)?.name ?? '?';
            const pupil = world.store(Identity).get(listener)?.name ?? '?';
            chronicle(
              world,
              'primeiro-ensino',
              `${teacher} ensinou "${WORD_TEXT[word]}" a ${pupil} — a espécie passou a transmitir o que sabe`,
              true,
            );
            passOn(world, speaker, listener, word);
          }
          return;
        }

        // Já sabem as mesmas palavras: então conversam sobre o que sabem, e é
        // aí que o conhecimento (não a palavra) passa de uma para a outra.
        const shared = lexicon.known();
        if (shared.length > 0) {
          const topic = shared[world.rng.int(shared.length)]!;
          passOn(world, speaker, listener, topic);
          say(world, speaker, topic, listener);
          chatter.cooldown = SPEAK_EVERY;
          const bio = bios.get(speaker);
          if (bio && !isBaby(bio)) emotions.loneliness = clamp01(emotions.loneliness - 0.05);
          return;
        }
      }
    });

    // ---- Dizer o que se está fazendo -------------------------------------
    //
    // Uma criatura que sabe a palavra "água" e vai beber DIZ "água". É aqui que
    // o vocabulário deixa de ser uma lista na ficha e vira comportamento
    // visível: o jogador vê a palavra que ele ensinou saindo da boca dela no
    // momento em que ela serve para alguma coisa.
    creatures.forEach((_tag, self) => {
      const lexicon = wordsStore.get(self);
      const mind = minds.get(self);
      const chatter = chatters.get(self);
      if (!lexicon || !mind || !chatter) return;

      chatter.voice -= dt;
      const word = WORD_FOR_INTENT[mind.intent];
      // Só quando a intenção MUDA: repetir "água" durante a caminhada inteira
      // até o lago transformaria a fala num zumbido.
      if (word === undefined || mind.intent === chatter.spoke) {
        if (mind.intent !== chatter.spoke) chatter.spoke = mind.intent;
        return;
      }
      chatter.spoke = mind.intent;
      if (chatter.voice > 0 || !lexicon.knows(word)) return;
      say(world, self, word);
      chatter.voice = VOICE_EVERY;
    });

    // ---- O que não se repete, se perde -----------------------------------
    wordsStore.forEach((lexicon) => lexicon.fade(dt));
  },
};

/**
 * Qual palavra a máquina mostra agora.
 *
 * Ela TERMINA o que começou. Enquanto a turma presente não dominar a palavra
 * atual, a tela não muda — e só quando aquela lição está aprendida é que ela
 * passa para a mais adiantada das que faltam.
 *
 * A primeira versão fazia o contrário, mostrando sempre a palavra menos sabida:
 * parecia justo e era desastroso. A máquina espalhava um pouquinho de dez
 * palavras por todas as cabeças, nenhuma chegava perto de virar conhecimento, e
 * o esquecimento levava tudo embora entre uma visita e outra. Medido: vinte e
 * cinco minutos de jardim, vinte e cinco mil lições dadas, zero palavras
 * aprendidas. Ensinar é insistir.
 */
function nextLesson(
  wordsStore: { get(id: number): Lexicon | undefined },
  students: readonly number[],
  current: number,
): number {
  const average = (word: number): number => {
    let total = 0;
    for (const student of students) total += wordsStore.get(student)?.graspOf(word) ?? 0;
    return total / students.length;
  };

  // A turma ainda não sabe a palavra que está na tela: continua nela.
  if (average(current) < KNOWN) return current;

  let best = -1;
  let highest = -1;
  for (let word = 0; word < WORD_COUNT; word++) {
    const grasp = average(word);
    if (grasp >= KNOWN) continue;
    if (grasp > highest) {
      highest = grasp;
      best = word;
    }
  }
  // Esta turma já sabe tudo: a tela repete a última, como quem revisa.
  return best >= 0 ? best : current;
}
