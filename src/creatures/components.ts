import type { CreatureMemory } from '@core';
import { defineComponent } from '@engine';
import type { Genome, PersonalityTraits } from '@genetics';

export type Sex = 'M' | 'F';

/** O que a criatura está fazendo agora. Escolhido por pontuação, não por script. */
export type Intent =
  | 'wander'
  | 'seekFood'
  | 'seekWater'
  | 'sleep'
  | 'flee'
  | 'approachPlayer'
  | 'socialize'
  | 'play'
  | 'attack'
  | 'share'
  | 'mate'
  | 'watch'
  | 'shelter'
  | 'sunbathe'
  | 'search'
  | 'follow';

/** Expressão facial dominante, derivada das emoções. */
export type Mood =
  | 'neutral'
  | 'happy'
  | 'needy'
  | 'sleepy'
  | 'surprised'
  | 'angry'
  | 'sad'
  | 'loved'
  | 'afraid'
  | 'curious'
  | 'hungry'
  | 'thirsty'
  | 'playful';

/** Marca uma entidade como criatura. */
export const Creature = defineComponent<true>('Creature');

/** Necessidades fisiológicas, 0..1. hunger/thirst: 0 = saciado, 1 = crítico. */
export interface Needs {
  hunger: number;
  thirst: number;
  energy: number;
  health: number;
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
