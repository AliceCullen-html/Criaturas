import { clamp, clamp01, subjects } from '@core';
import { Transform, type World } from '@engine';
import { Emotions, Identity, Memory, Mind, Needs } from '@creatures';
import { Item, itemRadius } from '@world';
import { PlayerResource } from './player';

/**
 * Ações da "mão" do jogador sobre o mundo. Todas nascem de gestos físicos —
 * não existe botão por trás de nenhuma delas.
 */

const PET_TRUST_GAIN = 0.012;
const PET_HAPPINESS_GAIN = 0.02;
const ROUGH_FEAR = 0.35;
const ROUGH_TRAUMA = 0.16;
const PUSH_DISTANCE = 26;
const OFFER_REACH = 26;

function episodeBase(world: World, id: number) {
  const transform = world.store(Transform).get(id);
  return { tick: world.tick, x: transform?.x ?? 0, y: transform?.y ?? 0, actor: 'você' };
}

/** Pega um objeto: ele passa a acompanhar a mão. */
export function grabItem(world: World, id: number): void {
  const item = world.store(Item).get(id);
  if (!item) return;
  item.held = true;
  item.vx = 0;
  item.vy = 0;
}

/** Move o objeto que está na mão. */
export function moveHeldItem(world: World, id: number, x: number, y: number): void {
  const transform = world.store(Transform).get(id);
  if (!transform) return;
  transform.prevX = transform.x;
  transform.prevY = transform.y;
  transform.x = clamp(x, 3, world.config.width - 3);
  transform.y = clamp(y, 3, world.config.height - 3);
}

/** Solta o objeto, com a velocidade do gesto (arremesso). */
export function releaseItem(world: World, id: number, vx: number, vy: number): void {
  const item = world.store(Item).get(id);
  if (!item) return;
  item.held = false;
  item.vx = vx;
  item.vy = vy;

  // Um objeto arremessado com força assusta quem estiver por perto.
  const speed = Math.hypot(vx, vy);
  if (speed < 220) return;
  const transform = world.store(Transform).get(id);
  if (!transform) return;
  scareNear(world, transform.x, transform.y, 60, 0.25);
}

/**
 * Carinho: só funciona de verdade se houver confiança. Quem teme o jogador
 * recua e se estressa em vez de relaxar.
 */
export function petCreature(world: World, id: number, dt: number): 'accepted' | 'refused' {
  const emotions = world.store(Emotions).get(id);
  const memory = world.store(Memory).get(id);
  const mind = world.store(Mind).get(id);
  if (!emotions || !memory || !mind) return 'refused';

  const bond = memory.valenceOf(subjects.player());
  const scared = emotions.fear > 0.5 || bond < -0.15;

  if (scared) {
    emotions.stress = clamp01(emotions.stress + 0.25 * dt);
    emotions.fear = clamp01(emotions.fear + 0.15 * dt);
    mind.commitment = 0;
    return 'refused';
  }

  emotions.trust = clamp01(emotions.trust + PET_TRUST_GAIN * dt);
  emotions.happiness = clamp01(emotions.happiness + PET_HAPPINESS_GAIN * dt);
  emotions.stress = clamp01(emotions.stress - 0.2 * dt);
  emotions.loneliness = clamp01(emotions.loneliness - 0.3 * dt);
  memory.record(subjects.player(), 0.7, 0.06 * dt);
  mind.affection = 1.2;
  return 'accepted';
}

/** Registra o carinho como lembrança depois de um afago prolongado. */
export function rememberPetting(world: World, id: number): void {
  const memory = world.store(Memory).get(id);
  if (!memory) return;
  memory.addEpisode({
    text: 'Você me fez carinho',
    valence: 0.8,
    intensity: 0.5,
    emotion: 'ternura',
    ...episodeBase(world, id),
  });
}

/** Gesto brusco sobre a criatura: empurrão, medo e marca de trauma. */
export function roughGesture(
  world: World,
  id: number,
  speed: number,
  dirX: number,
  dirY: number,
): void {
  const emotions = world.store(Emotions).get(id);
  const memory = world.store(Memory).get(id);
  const transform = world.store(Transform).get(id);
  const mind = world.store(Mind).get(id);
  const needs = world.store(Needs).get(id);
  if (!emotions || !memory || !transform || !mind) return;

  const violent = speed > 900;
  emotions.fear = clamp01(emotions.fear + ROUGH_FEAR * (violent ? 1.6 : 1));
  emotions.stress = clamp01(emotions.stress + 0.3);
  emotions.anger = clamp01(emotions.anger + (violent ? 0.35 : 0.15));
  emotions.trust = clamp01(emotions.trust - (violent ? 0.3 : 0.12));
  emotions.trauma = clamp01(emotions.trauma + (violent ? ROUGH_TRAUMA : ROUGH_TRAUMA * 0.4));
  if (violent && needs) needs.health = clamp01(needs.health - 0.06);

  // Empurra fisicamente.
  const len = Math.hypot(dirX, dirY) || 1;
  transform.x = clamp(transform.x + (dirX / len) * PUSH_DISTANCE, 3, world.config.width - 3);
  transform.y = clamp(transform.y + (dirY / len) * PUSH_DISTANCE, 3, world.config.height - 3);

  memory.record(subjects.player(), violent ? -1 : -0.7, violent ? 0.9 : 0.5);
  memory.record(subjects.place(transform.x, transform.y), -0.5, 0.3);
  memory.addEpisode({
    text: violent ? 'Você me machucou' : 'Você me empurrou',
    valence: violent ? -1 : -0.7,
    intensity: violent ? 1 : 0.6,
    emotion: violent ? 'pânico' : 'susto',
    ...episodeBase(world, id),
  });
  mind.surprise = 2;
  mind.commitment = 0;
}

/** Chamar a atenção (duplo clique): a criatura olha, e pode vir se confiar. */
export function callAttention(world: World, id: number): void {
  const mind = world.store(Mind).get(id);
  const emotions = world.store(Emotions).get(id);
  if (!mind || !emotions) return;
  mind.attention = 4;
  mind.commitment = 0;
  emotions.curiosity = clamp01(emotions.curiosity + 0.2);
}

/** Modo observação: a criatura percebe o olhar e reage conforme a confiança. */
export function observeCreature(world: World, id: number): void {
  const mind = world.store(Mind).get(id);
  if (!mind) return;
  mind.attention = Math.max(mind.attention, 1.5);
}

/**
 * Oferecer um objeto: a criatura **decide** se aceita. Fome, confiança e a
 * opinião sobre aquele alimento entram na conta.
 */
export function offerItem(world: World, itemId: number, creatureId: number): boolean {
  const item = world.store(Item).get(itemId);
  const needs = world.store(Needs).get(creatureId);
  const emotions = world.store(Emotions).get(creatureId);
  const memory = world.store(Memory).get(creatureId);
  const mind = world.store(Mind).get(creatureId);
  const itemTransform = world.store(Transform).get(itemId);
  const creatureTransform = world.store(Transform).get(creatureId);
  if (!item || !needs || !emotions || !memory || !mind || !itemTransform || !creatureTransform) {
    return false;
  }

  const distance = Math.hypot(
    itemTransform.x - creatureTransform.x,
    itemTransform.y - creatureTransform.y,
  );
  if (distance > OFFER_REACH + itemRadius(item)) return false;

  const bond = memory.valenceOf(subjects.player());
  const opinion = memory.valenceOf(subjects.food(item.variant));

  if (item.kind === 'toy') {
    // Brinquedo: aceita se não estiver com medo.
    if (emotions.fear > 0.5) return false;
    emotions.happiness = clamp01(emotions.happiness + 0.12);
    emotions.loneliness = clamp01(emotions.loneliness - 0.35);
    memory.record(subjects.player(), 0.6, 0.25);
    memory.addEpisode({
      text: 'Você brincou comigo',
      valence: 0.75,
      intensity: 0.55,
      emotion: 'alegria',
      ...episodeBase(world, creatureId),
    });
    mind.affection = 2.5;
    return true;
  }

  // Recusa: com medo, sem fome, ou se aprendeu que aquilo faz mal.
  const hungry = needs.hunger > 0.25;
  const trusts = bond > -0.1 || emotions.fear < 0.35;
  if (!hungry || !trusts || opinion < -0.35) return false;

  needs.hunger = clamp01(needs.hunger - 0.3);
  emotions.trust = clamp01(emotions.trust + 0.1);
  emotions.happiness = clamp01(emotions.happiness + 0.1);
  memory.record(subjects.player(), 0.85, 0.35);

  if (item.toxic) {
    needs.health = clamp01(needs.health - 0.15);
    emotions.stress = clamp01(emotions.stress + 0.3);
    memory.record(subjects.food(item.variant), -1, 0.7);
    memory.addEpisode({
      text: 'Comi algo que você me deu e passei mal',
      valence: -0.7,
      intensity: 0.8,
      emotion: 'mal-estar',
      ...episodeBase(world, creatureId),
    });
  } else {
    memory.record(subjects.food(item.variant), 0.7, 0.35);
    memory.addEpisode({
      text: 'Você me alimentou',
      valence: 0.85,
      intensity: 0.6,
      emotion: 'gratidão',
      ...episodeBase(world, creatureId),
    });
    mind.affection = 2.5;
  }

  world.destroyEntity(itemId);
  return true;
}

/** Assusta criaturas num raio (objeto arremessado, gesto violento). */
function scareNear(world: World, x: number, y: number, radius: number, amount: number): void {
  const transforms = world.store(Transform);
  world.store(Emotions).forEach((emotions, entity) => {
    const transform = transforms.get(entity);
    if (!transform) return;
    if (Math.hypot(transform.x - x, transform.y - y) > radius) return;
    emotions.fear = clamp01(emotions.fear + amount);
    emotions.stress = clamp01(emotions.stress + amount * 0.6);
    const mind = world.store(Mind).get(entity);
    if (mind) {
      mind.surprise = 1.5;
      mind.commitment = 0;
    }
  });
}

/** Renomeia a criatura (única ação ainda feita pelo painel). */
export function setCreatureName(world: World, id: number, name: string): void {
  const identity = world.store(Identity).get(id);
  if (identity) identity.name = name;
}

/** Atualiza a presença da mão no mundo. */
export function setHandPresence(world: World, x: number, y: number, present: boolean): void {
  const presence = world.getResource(PlayerResource);
  presence.x = x;
  presence.y = y;
  presence.present = present;
}
