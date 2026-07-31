import { INTENT_NAMES, WORD_TEXT, subjects, type Episode } from '@core';
import { Plan } from './systems/planSystem';
import { ROUTINE, ROUTINE_NAMES } from './routines';
import type { World } from '@engine';
import { describePersonality, type PersonalityTraits } from '@genetics';
import {
  Habits,
  Appearance,
  Egg,
  Attributes,
  Bio,
  Bond,
  Creature,
  CreatureGenome,
  Emotions,
  Identity,
  Lineage,
  Memory,
  Mind,
  Needs,
  Personality,
  Words,
  type Intent,
  type Mood,
  type Sex,
} from '@creatures';
import { isBaby, isElder } from './age';
import { Goal, goalText } from './systems/goalSystem';

/** Retrato de leitura de uma criatura para a UI (dados planos, sem o ECS). */
export interface CreatureSnapshot {
  id: number;
  name: string;
  sex: Sex;
  species: string;
  age: number;
  lifespan: number;
  isBaby: boolean;
  /**
   * -1 depois de nascida; 0..1 enquanto está no ovo.
   *
   * A ficha de um ovo é curta de propósito — não há humor, não há história,
   * não há amizade. Há um nome e o quanto falta. Mas ela EXISTE, e é o que
   * transforma "tem um ovo ali" em "o Bibo está para nascer".
   */
  egg: number;
  intent: Intent;
  /** A história em curso, em palavras — vazio se não houver nenhuma. */
  story: string;
  mood: Mood;

  needs: { hunger: number; thirst: number; energy: number; health: number };
  emotions: Emotions;
  traits: PersonalityTraits;
  personality: string[];

  speed: number;
  vision: number;
  strength: number;
  fertility: number;
  size: number;

  dna: string;
  generation: number;
  parentA: string | null;
  parentB: string | null;

  isElder: boolean;
  trauma: number;
  /** A marca que não sai: 0 = nunca sofreu, 1 = vive com medo. */
  scar: number;
  /** Vínculo com o jogador: -1 (teme) … +1 (confia plenamente). */
  bond: number;
  /**
   * O nome de quem ela mais gosta, ou null. Vai para a ficha porque uma
   * amizade que só existe dentro do código não é uma amizade — é um campo de
   * dados. O jogador precisa poder saber de quem ela gosta.
   */
  friend: string | null;
  /**
   * As palavras que ela sabe dizer.
   *
   * Vai para a ficha porque é a coisa mais difícil de perceber olhando o
   * jardim: um vínculo se vê (elas andam juntas), a fome se vê (ela corre para
   * a fruta), mas saber uma palavra só aparece quando ela fala — e o jogador
   * que passou meia hora ensinando precisa poder conferir o que entrou.
   */
  words: string[];
  /**
   * O QUE COSTUMA VALER A PENA PARA ELA — por intenção, 0..1.
   *
   * Vai para a ficha porque é a coisa mais invisível que a criatura tem: um
   * vínculo se vê, a fome se vê, mas "esta aqui aprendeu que procurar comida dá
   * certo e aquela aprendeu que não" só existe dentro da cabeça dela. É o que o
   * painel usa para mostrar duas irmãs virando pessoas diferentes.
   */
  habits: Array<{ intent: Intent; value: number; tries: number }>;
  /**
   * O QUE ELA ANDA QUERENDO DA VIDA, em palavras.
   *
   * O briefing pedia "objetivo atual" no painel e ele não existia: tudo o que
   * a criatura tinha era curto — a intenção dura segundos, a historinha meio
   * minuto. `null` quando ela ainda não tem projeto nenhum, que é o caso de
   * todo filhote.
   */
  goal: string | null;
  /** Há quantos segundos ela vive em volta disso. */
  goalFor: number;
  memories: Episode[];
  children: string[];
  friends: Array<{ name: string; affinity: number }>;
}

export function readCreatureSnapshot(world: World, id: number): CreatureSnapshot | null {
  // Um ovo não é criatura para nenhum sistema do jogo — mas é para o jogador,
  // que clicou nele e quer saber de quem é aquilo.
  const egg = world.hasComponent(Egg) ? world.store(Egg).get(id) : undefined;
  if (!egg && !world.store(Creature).has(id)) return null;
  const needs = world.store(Needs).get(id);
  const emotions = world.store(Emotions).get(id);
  const bio = world.store(Bio).get(id);
  const attributes = world.store(Attributes).get(id);
  const identity = world.store(Identity).get(id);
  const mind = world.store(Mind).get(id);
  const appearance = world.store(Appearance).get(id);
  const lineage = world.store(Lineage).get(id);
  const traits = world.store(Personality).get(id);
  const memory = world.store(Memory).get(id);
  const genome = world.store(CreatureGenome).get(id);
  if (
    !needs ||
    !emotions ||
    !bio ||
    !attributes ||
    !identity ||
    !mind ||
    !appearance ||
    !lineage ||
    !traits ||
    !memory ||
    !genome
  ) {
    return null;
  }

  return {
    id,
    name: identity.name,
    sex: bio.sex,
    species: bio.species,
    age: bio.age,
    lifespan: bio.lifespan,
    isBaby: isBaby(bio),
    egg: egg ? Math.min(1, egg.time / egg.duration) : -1,
    intent: mind.intent,
    story: storyOf(world, id),
    friend: friendName(world, id),
    mood: mind.mood,
    needs: { ...needs },
    emotions: { ...emotions },
    traits: { ...traits },
    personality: describePersonality(traits),
    speed: attributes.speed,
    vision: attributes.vision,
    strength: attributes.strength,
    fertility: attributes.fertility,
    size: attributes.size,
    dna: formatDna(genome),
    generation: lineage.generation,
    parentA: lineage.parentA,
    parentB: lineage.parentB,
    isElder: isElder(bio),
    trauma: emotions.trauma,
    scar: emotions.scar,
    bond: memory.valenceOf(subjects.player()),
    words: (world.store(Words).get(id)?.known() ?? []).map((word) => WORD_TEXT[word] ?? '?'),
    habits: readHabits(world, id),
    goal: goalText(world, id),
    goalFor: world.store(Goal).get(id)?.elapsed ?? 0,
    memories: memory.episodes.slice(0, 8),
    children: findChildren(world, identity.name),
    friends: findFriends(world, id, memory),
  };
}

/**
 * A experiência de vida dela, das intenções que ela já julgou.
 *
 * Só as que têm tentativa: uma intenção nunca vivida está em 0,5 porque ninguém
 * a julgou, e mostrar isso como opinião seria mentir. O que interessa ver é onde
 * a vida dela já deixou marca.
 */
function readHabits(
  world: World,
  id: number,
): Array<{ intent: Intent; value: number; tries: number }> {
  if (!world.hasComponent(Habits)) return [];
  const habit = world.store(Habits).get(id);
  if (!habit) return [];
  const out: Array<{ intent: Intent; value: number; tries: number }> = [];
  for (let i = 0; i < INTENT_NAMES.length; i++) {
    const tries = habit.tries[i] ?? 0;
    if (tries === 0) continue;
    out.push({ intent: INTENT_NAMES[i]!, value: habit.value[i] ?? 0.5, tries });
  }
  return out.sort((a, b) => b.value - a.value);
}

/** Descendentes vivos, pelo nome dos pais registrado na linhagem. */
function findChildren(world: World, name: string): string[] {
  const names: string[] = [];
  const identities = world.store(Identity);
  world.store(Lineage).forEach((lineage, entity) => {
    if (lineage.parentA === name || lineage.parentB === name) {
      const childName = identities.get(entity)?.name;
      if (childName) names.push(childName);
    }
  });
  return names;
}

/** Laços mais fortes (para o bem ou para o mal) com outras criaturas vivas. */
function findFriends(
  world: World,
  id: number,
  memory: { valenceOf(subject: string): number },
): Array<{ name: string; affinity: number }> {
  const identities = world.store(Identity);
  const found: Array<{ name: string; affinity: number }> = [];
  world.store(Creature).forEach((_tag, other) => {
    if (other === id) return;
    const affinity = memory.valenceOf(subjects.creature(other));
    if (Math.abs(affinity) < 0.15) return;
    const name = identities.get(other)?.name;
    if (name) found.push({ name, affinity });
  });
  return found.sort((a, b) => Math.abs(b.affinity) - Math.abs(a.affinity)).slice(0, 4);
}

/** Assinatura curta e legível do genoma, para exibição. */
function formatDna(genome: Float32Array): string {
  let out = '';
  for (let i = 0; i < genome.length; i++) {
    out += Math.round((genome[i] ?? 0) * 15)
      .toString(16)
      .toUpperCase();
  }
  return out;
}

/**
 * O que a criatura está fazendo AGORA, se for uma história.
 *
 * O cartão é a única superfície do jogo, e o que ele mostra tem de ser o que
 * emociona. "levando comida para a Nina" conta mais sobre a vida dela do que
 * qualquer barra.
 */
/** O nome de quem ela mais gosta, se o laço for forte o bastante para contar. */
function friendName(world: World, id: number): string | null {
  const bond = world.store(Bond).get(id);
  if (!bond || bond.friend < 0 || bond.friendship < 0.25) return null;
  return world.store(Identity).get(bond.friend)?.name ?? null;
}

function storyOf(world: World, id: number): string {
  const plan = world.store(Plan).get(id);
  if (!plan || plan.routine === ROUTINE.none) return '';
  const other = plan.other >= 0 ? world.store(Identity).get(plan.other)?.name : null;
  const what = ROUTINE_NAMES[plan.routine] ?? '';
  if (!what) return '';
  return other ? what.replace('alguém', other).replace('a outra', other) : what;
}
