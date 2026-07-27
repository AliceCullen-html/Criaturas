import { POSE, POSE_DURATION, type Rng } from '@core';
import { Transform, Velocity, type System } from '@engine';
import { Behavior, Bio, Creature, Emotions, Mind, Needs, Personality } from '@creatures';
import type { PersonalityTraits } from '@genetics';
import { Order } from '../orders';
import {
  AMBIENT_BIRD,
  AmbientResource,
  PROP,
  PropsResource,
  SceneryResource,
  TerrainResource,
  findNearestWater,
  type Prop,
  type SceneryPiece,
  type AmbientBeing,
  type Terrain,
} from '@world';
import { isBaby, isElder } from '../age';

/**
 * O que a criatura faz quando não está indo a lugar nenhum.
 *
 * Nada aqui tem consequência mecânica: ninguém fica menos faminto por se
 * espreguiçar. A pose existe para que a personalidade **apareça sem precisar de
 * painel** — a preguiçosa senta toda hora, a curiosa cheira tudo, a tímida se
 * limpa num canto, a brincalhona rola no chão.
 *
 * Não passa pelo cérebro de utilidade de propósito: pontuar "coçar a cabeça"
 * contra "fugir do predador" na mesma lista misturaria o que é decisão com o
 * que é maneirismo. O cérebro decide para onde ir; isto preenche o resto.
 */

/** Só gesticula quando a intenção é ociosa — nunca no meio de uma urgência. */
const IDLE_INTENTS = new Set(['wander', 'watch', 'sunbathe', 'socialize', 'follow', 'play']);

/** Acima disto, a criatura tem o que fazer e não fica de bobeira. */
const URGENT_HUNGER = 0.65;
const URGENT_THIRST = 0.65;
const URGENT_FEAR = 0.45;
/** Acima disto a criatura fica encolhida de dor. */
const PAIN_HOLDS = 0.25;
/** E acima disto nem anda. */
const PAIN_FREEZES = 0.55;

/** Intervalo entre microcomportamentos (segundos), antes da personalidade. */
const MIN_GAP = 1.5;
const MAX_GAP = 7;

/** Alcances de contexto. */
const FLOWER_REACH = 24;
const WATER_REACH = 34;
const BIRD_REACH = 80;
const SHADE_REACH = 34;

interface Options {
  pose: number;
  weight: number;
}

const options: Options[] = [];

/**
 * Piso comum para todo gesto possível, para que o temperamento **incline** sem
 * ELIMINAR: a preguiçosa senta muito mais, mas ainda é vista fazendo outra
 * coisa de vez em quando.
 *
 * Tem de ser pequeno. Na primeira tentativa era 0.22, e como há mais de dez
 * opções em jogo o piso virou metade do peso total — as criaturas ficaram
 * todas iguais, e a preguiçosa chegou a descansar MENOS que a agitada.
 */
const FLOOR = 0.07;

const add = (pose: number, weight: number): void => {
  if (weight > 0.01) options.push({ pose, weight: weight + FLOOR });
};

/** Existe algum prop de um tipo por perto? */
function propNear(props: readonly Prop[], kind: number, x: number, y: number, reach: number) {
  const reach2 = reach * reach;
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]!;
    if (prop.kind !== kind) continue;
    const dx = prop.x - x;
    const dy = prop.y - y;
    if (dx * dx + dy * dy <= reach2) return true;
  }
  return false;
}

export const idleSystem: System = {
  name: 'idle',
  update(world, dt) {
    const behaviors = world.store(Behavior);
    const minds = world.store(Mind);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const traitsStore = world.store(Personality);
    const transforms = world.store(Transform);
    const velocities = world.store(Velocity);
    const bios = world.store(Bio);

    const orders = world.store(Order);
    const props = world.getResource(PropsResource);
    const scenery = world.getResource(SceneryResource);
    const beings = world.getResource(AmbientResource);
    const terrain = world.getResource(TerrainResource);
    const { rng } = world;

    world.store(Creature).forEach((_tag, entity) => {
      const behavior = behaviors.get(entity);
      const mind = minds.get(entity);
      const needs = needsStore.get(entity);
      const emotions = emotionsStore.get(entity);
      const traits = traitsStore.get(entity);
      const transform = transforms.get(entity);
      const bio = bios.get(entity);
      if (!behavior || !mind || !needs || !emotions || !traits || !transform || !bio) return;

      // Dor manda em tudo. Machucada, ela encolhe onde está e não faz mais
      // nada até passar — é isso que torna o sofrimento VISÍVEL, e não apenas
      // um número escondido na ficha.
      if (emotions.pain > PAIN_HOLDS) {
        behavior.pose = POSE.hurt;
        behavior.elapsed = 0;
        behavior.duration = 1;
        behavior.cooldown = 0;
        const velocity = velocities.get(entity);
        if (velocity && emotions.pain > PAIN_FREEZES) {
          velocity.x = 0;
          velocity.y = 0;
        }
        return;
      }

      // Sob ordem do jogador, ela não fica de bobeira. Sem esta linha o gesto
      // ocioso congelava a criatura no lugar e a ordem não saía do papel: ela
      // recebia "vá até lá", e ficava parada se coçando.
      const underOrder = orders.has(entity);

      const urgent =
        underOrder ||
        needs.hunger > URGENT_HUNGER ||
        needs.thirst > URGENT_THIRST ||
        emotions.fear > URGENT_FEAR ||
        !IDLE_INTENTS.has(mind.intent);

      // Pose em curso: corre o relógio e segura a criatura parada. É isso que
      // faz "parar para ouvir um pássaro" ser realmente uma parada.
      if (behavior.pose !== POSE.none) {
        behavior.elapsed += dt;
        if (behavior.elapsed >= behavior.duration || urgent) {
          behavior.pose = POSE.none;
          behavior.elapsed = 0;
          behavior.cooldown = rng.range(MIN_GAP, MAX_GAP);
          return;
        }
        const velocity = velocities.get(entity);
        if (velocity) {
          velocity.x = 0;
          velocity.y = 0;
        }
        return;
      }

      behavior.cooldown -= dt;
      if (behavior.cooldown > 0 || urgent) return;

      // Andando depressa não se para para cheirar flor; só quem já está à toa.
      const velocity = velocities.get(entity);
      const speed = velocity ? Math.hypot(velocity.x, velocity.y) : 0;
      if (speed > 6) {
        behavior.cooldown = rng.range(1, 3);
        return;
      }

      const chosen = choose(
        { traits, emotions, needs, bio },
        { x: transform.x, y: transform.y, props, scenery, beings, terrain },
        rng,
      );
      if (chosen === POSE.none) {
        behavior.cooldown = rng.range(MIN_GAP, MAX_GAP);
        return;
      }

      behavior.pose = chosen;
      behavior.elapsed = 0;
      // Cada bicho segura a pose um pouco diferente.
      behavior.duration = (POSE_DURATION[chosen] ?? 2) * rng.range(0.75, 1.3);
    });
  },
};

interface Surroundings {
  x: number;
  y: number;
  props: readonly Prop[];
  scenery: readonly SceneryPiece[];
  beings: readonly AmbientBeing[];
  terrain: Terrain;
}

interface Self {
  traits: PersonalityTraits;
  emotions: Emotions;
  needs: Needs;
  bio: Bio;
}

/** Sorteia o próximo gesto, pesado por temperamento e pelo que há em volta. */
function choose(self: Self, around: Surroundings, rng: Rng): number {
  const { traits, emotions, needs, bio } = self;
  const { x, y, props, scenery, beings, terrain } = around;
  options.length = 0;

  const lazy = 1 - traits.activity;
  const timid = 1 - traits.bravery;
  const baby = isBaby(bio);
  const elder = isElder(bio);

  // ---- Sempre possíveis ------------------------------------------------
  add(POSE.scratch, 0.5);
  add(POSE.sigh, 0.3 + (1 - emotions.happiness) * 0.5);
  add(POSE.stretch, 0.2 + traits.activity * traits.activity * 1.6);
  add(POSE.groom, 0.15 + timid * timid * 1.8);
  add(POSE.lookUp, 0.3 + traits.curiosity * 0.6 + traits.bravery * 0.3);
  add(POSE.ponder, 0.3 + lazy * 0.6);

  // ---- Preguiça: senta e deita ----------------------------------------
  add(POSE.sit, 0.2 + lazy * lazy * 3.4 + (1 - needs.energy) * 0.8 + (elder ? 0.6 : 0));
  const shade = scenery.some(
    (piece) => piece.kind === 'tree' && Math.hypot(piece.x - x, piece.y - y) < SHADE_REACH,
  );
  add(POSE.lie, (shade ? 1.6 : 0.25) * (0.2 + lazy * lazy * 2.6 + emotions.sleepiness));

  // ---- Brincalhona ------------------------------------------------------
  add(POSE.roll, (0.1 + traits.playfulness * traits.playfulness * 2.6) * (baby ? 1.8 : 1) * emotions.happiness);
  add(POSE.shake, 0.3 + traits.playfulness * 0.6);
  add(POSE.perk, (0.2 + traits.playfulness * 0.8) * emotions.happiness);
  if (propNear(props, PROP.fallenLeaf, x, y, FLOWER_REACH)) {
    add(POSE.play, (0.4 + traits.playfulness * 1.8) * (baby ? 1.6 : 1));
  }

  // ---- Curiosa: o contexto convida -------------------------------------
  if (propNear(props, PROP.flower, x, y, FLOWER_REACH)) {
    add(POSE.sniff, 0.2 + traits.curiosity * traits.curiosity * 2.6 + emotions.curiosity * 0.8);
  }
  const water = findNearestWater(terrain, x, y, WATER_REACH);
  if (water) {
    add(POSE.lookDown, 0.2 + traits.curiosity * traits.curiosity * 2.2);
    // Escorregar na beira é raro — e é engraçado justamente por isso.
    add(POSE.slip, 0.12 * (baby ? 2.5 : 1) * (1 - traits.bravery * 0.5));
  } else {
    add(POSE.dig, 0.25 + traits.curiosity * 0.9);
  }
  const bird = beings.some(
    (being) => being.kind === AMBIENT_BIRD && Math.hypot(being.x - x, being.y - y) < BIRD_REACH,
  );
  if (bird) add(POSE.listen, 0.5 + traits.curiosity * 1.2 + timid * 0.8);

  let total = 0;
  for (let i = 0; i < options.length; i++) total += options[i]!.weight;
  if (total <= 0) return POSE.none;

  let roll = rng.next() * total;
  for (let i = 0; i < options.length; i++) {
    roll -= options[i]!.weight;
    if (roll <= 0) return options[i]!.pose;
  }
  return options[options.length - 1]!.pose;
}
