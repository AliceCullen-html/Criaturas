import { placeSpot, subjects, type MemorySubject } from '@core';
import { Transform, defineComponent, type System } from '@engine';
import { Bio, Creature, Emotions, Identity, Memory, Needs, Personality } from '@creatures';
import { chronicle } from '../chronicle';
import { isBaby } from '../age';

/**
 * O QUE ELA ANDA QUERENDO DA VIDA.
 *
 * Tudo o que a criatura tinha até aqui era curto. A intenção dura segundos; a
 * historinha do `planSystem` dura meio minuto; o hábito é uma média, não uma
 * vontade. Nada durava o bastante para o jogador conseguir dizer "ela está
 * tentando alguma coisa" — e um bicho que só reage não tem projeto nenhum.
 *
 * Um OBJETIVO aqui é a coisa mais simples que ainda merece o nome: **o assunto
 * que ela mais quer estar perto, escolhido devagar e mantido por muito tempo.**
 * Não há lista de objetivos possíveis, não há "formar amizade" nem "achar
 * comida" escritos em lugar nenhum. Há a memória dela — lugares, criaturas,
 * coisas — e uma pergunta feita de minuto em minuto: do que eu mais gosto, e o
 * que me falta agora?
 *
 * O QUE FALTA PESA. A mesma memória dá objetivos diferentes conforme a vida:
 * quem está sozinha puxa para as criaturas de quem gosta, quem passa fome puxa
 * para o lugar onde comeu bem, quem está entediada puxa para as coisas com que
 * brincou. Duas irmãs com as mesmas lembranças e necessidades diferentes
 * acabam com projetos diferentes, e é essa a peça que faltava para uma criatura
 * ter uma FASE da vida em vez de só um humor.
 *
 * E ele custa a mudar. Se fosse recalculado a todo instante seria só mais um
 * termo da utilidade, e não um projeto: o que faz um objetivo ser um objetivo é
 * ele sobreviver a um dia ruim. O que está em curso ganha vantagem sobre
 * qualquer candidato novo, e só cede quando outra coisa passa a valer bem mais.
 */

export interface Goal {
  /** O assunto perseguido — `place:`, `creature:` ou `thing:`. Vazio = nenhum. */
  subject: MemorySubject;
  /** Há quantos segundos ela vive em volta disto. */
  elapsed: number;
  /** Segundos até a próxima reconsideração. */
  rethinkIn: number;
}
export const Goal = defineComponent<Goal>('Goal');

/**
 * De quanto em quanto tempo ela reconsidera a vida.
 *
 * Noventa segundos. Menos que isso e o objetivo vira mais um termo da conta de
 * utilidade, que já existe e já é reavaliada a todo instante. Mais que isso e
 * uma criatura cuja amiga morreu continuaria vivendo em volta de um fantasma.
 */
const RETHINK = 90;
/**
 * O quanto o objetivo em curso vale a mais do que um candidato novo.
 *
 * Metade a mais. É a inércia que separa um projeto de um capricho: o que ela já
 * está perseguindo não cai por um empate, só por alguém claramente melhor.
 */
const LOYALTY = 1.5;
/** Abaixo disto nada é bom o bastante para virar projeto de vida. */
const WORTH_IT = 0.15;
/** Filhote não tem projeto: ele tem os pais. */
const GROWN_ENOUGH = 0.12;

/**
 * O peso que cada tipo de assunto ganha, dado o que está faltando agora.
 *
 * Aqui não se escolhe o objetivo — escolhe-se o que a criatura está mais
 * disposta a querer. É a única parte que sabe que existem lugares, criaturas e
 * coisas, e mesmo ela não sabe o que é comida nem o que é amizade.
 */
function appetiteFor(
  kind: string,
  needs: { hunger: number; thirst: number },
  emotions: { loneliness: number },
  traits: { sociability: number; curiosity: number },
): number {
  if (kind === 'creature') return 0.5 + emotions.loneliness * 1.2 + traits.sociability * 0.6;
  if (kind === 'place') return 0.6 + Math.max(needs.hunger, needs.thirst) * 1.1;
  // Uma coisa do mundo — o brinquedo, a flor, a pedra bonita.
  return 0.4 + traits.curiosity * 0.9;
}

export const goalSystem: System = {
  name: 'goal',
  update(world, dt) {
    const creatures = world.store(Creature);
    const goals = world.store(Goal);
    const memories = world.store(Memory);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const traitsStore = world.store(Personality);
    const bios = world.store(Bio);
    const identities = world.store(Identity);

    creatures.forEach((_tag, entity) => {
      const memory = memories.get(entity);
      const needs = needsStore.get(entity);
      const emotions = emotionsStore.get(entity);
      const traits = traitsStore.get(entity);
      const bio = bios.get(entity);
      if (!memory || !needs || !emotions || !traits || !bio) return;

      let goal = goals.get(entity);
      if (!goal) {
        // O PRIMEIRO PENSAMENTO SAI ESCALONADO, e sem sortear nada. Um sorteio
        // aqui consumiria da fila de números aleatórios do mundo, e um jardim
        // de semente fixa deixaria de ser o mesmo jardim só por ganhar um
        // sistema novo. O número da entidade já é um escalonador, e é de graça.
        goal = { subject: '', elapsed: 0, rethinkIn: RETHINK * (0.35 + ((entity * 37) % 65) / 100) };
        goals.set(entity, goal);
      }
      goal.elapsed += dt;
      goal.rethinkIn -= dt;
      if (goal.rethinkIn > 0) return;
      goal.rethinkIn = RETHINK;

      // Um filhote não tem projeto de vida: ele tem quem cuida dele.
      if (isBaby(bio) && bio.age / bio.lifespan < GROWN_ENOUGH) {
        goal.subject = '';
        return;
      }

      // O MELHOR ASSUNTO DA VIDA DELA, agora. A memória inteira entra na
      // disputa: lugares, criaturas e coisas, cada um pesado pelo que falta.
      let best = '';
      let bestScore = WORTH_IT;
      for (const prefix of ['place:', 'creature:', 'thing:'] as const) {
        const kind = prefix.slice(0, -1);
        const appetite = appetiteFor(kind, needs, emotions, traits);
        memory.forEachAbout(prefix, (subject, trace) => {
          const opinion = trace.valence * trace.strength;
          if (opinion <= 0) return;
          // Quem já não existe não é projeto. Uma criatura que morreu some do
          // mundo, e viver em volta dela seria viver em volta de um fantasma.
          if (kind === 'creature') {
            const who = Number(subject.slice(9));
            if (!Number.isFinite(who) || !creatures.has(who)) return;
          }
          const score = opinion * appetite * (subject === goal.subject ? LOYALTY : 1);
          if (score > bestScore) {
            bestScore = score;
            best = subject;
          }
        });
      }

      if (best === goal.subject) return;
      const before = goal.subject;
      goal.subject = best;
      goal.elapsed = 0;

      // A VIRADA DE VIDA VAI PARA O LIVRO — mas só a primeira de cada criatura,
      // e só quando havia algo antes. Trocar de projeto acontece; a primeira vez
      // que uma criatura passa a viver em função de outra coisa é história.
      if (!before || !best) return;
      const who = identities.get(entity)?.name ?? '?';
      chronicle(world, `virada-${entity}`, `${who} mudou o rumo: agora vive em volta de outra coisa`, true);
    });
  },
};

/** Para onde este objetivo aponta no jardim, se for um lugar alcançável. */
export function goalSpot(
  world: Parameters<typeof goalSystem.update>[0],
  entity: number,
): { x: number; y: number } | null {
  const goal = world.store(Goal).get(entity);
  if (!goal?.subject) return null;
  const place = placeSpot(goal.subject);
  if (place) return place;
  if (goal.subject.startsWith('creature:')) {
    const who = Number(goal.subject.slice(9));
    const spot = Number.isFinite(who) ? world.store(Transform).get(who) : null;
    if (spot) return { x: spot.x, y: spot.y };
  }
  return null;
}

/** O objetivo em palavras, para o painel e para o livro. */
export function goalText(
  world: Parameters<typeof goalSystem.update>[0],
  entity: number,
): string | null {
  const goal = world.store(Goal).get(entity);
  if (!goal?.subject) return null;
  if (goal.subject.startsWith('creature:')) {
    const who = Number(goal.subject.slice(9));
    const name = world.store(Identity).get(who)?.name;
    return name ? `ficar perto de ${name}` : null;
  }
  const place = placeSpot(goal.subject);
  if (place) return `viver em volta daquele canto do jardim`;
  if (goal.subject.startsWith('thing:')) return 'ter aquilo por perto';
  return null;
}

/** O assunto perseguido, para quem só precisa comparar. */
export const goalOf = (
  world: Parameters<typeof goalSystem.update>[0],
  entity: number,
): MemorySubject => world.store(Goal).get(entity)?.subject ?? '';

/** Ela já sabe o que quer? Usado só para medir. */
export const hasGoal = (
  world: Parameters<typeof goalSystem.update>[0],
  entity: number,
): boolean => (world.store(Goal).get(entity)?.subject ?? '') !== '';

/** O `subjects` local, para quem monta um objetivo à mão num teste. */
export const goalSubjects = subjects;
