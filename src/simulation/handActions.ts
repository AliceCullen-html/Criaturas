import { POSE, clamp, clamp01, subjects } from '@core';
import { Transform, type World } from '@engine';
import {
  Attributes,
  Behavior,
  Creature,
  Emotions,
  Identity,
  Memory,
  Mind,
  Needs,
} from '@creatures';
import { Item, MAX_STACK, SceneryResource, VARIANT, itemRadius, kickBall } from '@world';
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
const STACK_RADIUS = 9;
const HIDE_RADIUS = 15;
/** Acima disso o objeto foi arremessado: não encosta, não empilha, não esconde. */
const THROW_SPEED = 60;
/** Velocidade a partir da qual o gesto já conta como pancada. */
const ROUGH_SPEED_FLOOR = 620;

function episodeBase(world: World, id: number) {
  const transform = world.store(Transform).get(id);
  return { tick: world.tick, x: transform?.x ?? 0, y: transform?.y ?? 0, actor: 'você' };
}

/** Pega um objeto: ele passa a acompanhar a mão. */
export function grabItem(world: World, id: number): void {
  const item = world.store(Item).get(id);
  if (!item) return;
  item.held = true;
  // Ao sair do esconderijo ou do topo da pilha, o objeto volta a ser comum.
  item.hidden = false;
  item.stack = 0;
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

/** O que aconteceu com o objeto ao ser largado — o mundo responde a isso. */
export interface DropResult {
  /** Nível na pilha (0 = caiu solto no chão). */
  stacked: number;
  /** Ficou escondido atrás de uma pedra ou moita. */
  hidden: boolean;
}

const LOOSE_DROP: DropResult = { stacked: 0, hidden: false };

/**
 * Solta o objeto, com a velocidade do gesto (arremesso). Largar com cuidado é
 * diferente de atirar: pousado devagar atrás de uma pedra, o objeto **some** de
 * vista; pousado sobre outro, vira pilha.
 */
export function releaseItem(world: World, id: number, vx: number, vy: number): DropResult {
  const item = world.store(Item).get(id);
  if (!item) return LOOSE_DROP;
  item.held = false;
  // Pedra grande é pesada: cai onde foi largada, ninguém a arremessa.
  const heavy = item.kind === 'boulder';
  item.vx = heavy ? 0 : vx;
  item.vy = heavy ? 0 : vy;
  item.hidden = false;
  item.stack = 0;

  const transform = world.store(Transform).get(id);
  if (!transform) return LOOSE_DROP;

  const speed = heavy ? 0 : Math.hypot(vx, vy);
  // Bola arremessada VOA. A mão dá o rumo; a altura sai da força do gesto, e é
  // por isso que atirar a bola de longe é diferente de largá-la aos pés de
  // alguém: uma cruza o jardim quicando, a outra fica ali.
  if (item.kind === 'ball') kickBall(world, id, Math.min(60 + speed * 0.45, 260));
  if (speed >= THROW_SPEED) {
    // Um objeto arremessado com força assusta quem estiver por perto.
    if (speed >= 220) scareNear(world, transform.x, transform.y, 60, 0.25);
    return LOOSE_DROP;
  }

  if (heavy) return LOOSE_DROP;
  if (hideBehindScenery(world, item, transform)) return { stacked: 0, hidden: true };

  const level = stackOnNeighbour(world, id, item, transform);
  return level > 0 ? { stacked: level, hidden: false } : LOOSE_DROP;
}

/**
 * Pousado junto de uma pedra ou moita, o objeto fica atrás dela: continua no
 * mundo, mas ninguém o encontra sem procurar.
 */
function hideBehindScenery(world: World, item: Item, transform: Transform): boolean {
  const scenery = world.getResource(SceneryResource);
  for (const piece of scenery) {
    if (piece.kind === 'tree') continue; // tronco fino não esconde nada
    if (Math.hypot(piece.x - transform.x, piece.y - transform.y) > HIDE_RADIUS) continue;
    // Encosta atrás da pedra: o sprite dela passa a cobrir o objeto.
    transform.x = piece.x + (transform.x - piece.x) * 0.3;
    transform.y = piece.y - 5;
    transform.prevX = transform.x;
    transform.prevY = transform.y;
    item.hidden = true;
    return true;
  }
  return false;
}

/** Pousado em cima de outro objeto parado, forma uma pilha. */
function stackOnNeighbour(world: World, id: number, item: Item, transform: Transform): number {
  const transforms = world.store(Transform);
  let bestId = -1;
  let bestLevel = -1;
  let bestDistance = STACK_RADIUS;

  world.store(Item).forEach((other, entity) => {
    if (entity === id || other.held || other.hidden) return;
    if (other.stack >= MAX_STACK) return;
    const otherTransform = transforms.get(entity);
    if (!otherTransform) return;
    const distance = Math.hypot(otherTransform.x - transform.x, otherTransform.y - transform.y);
    if (distance > bestDistance) return;
    // Empilha sempre sobre o topo mais alto que estiver ao alcance.
    if (other.stack < bestLevel) return;
    bestDistance = distance;
    bestLevel = other.stack;
    bestId = entity;
  });

  if (bestId < 0) return 0;
  const base = transforms.get(bestId);
  if (!base) return 0;
  transform.x = base.x;
  transform.y = base.y;
  transform.prevX = base.x;
  transform.prevY = base.y;
  item.stack = bestLevel + 1;
  return item.stack;
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

  // A pancada dói. A dor é aguda e some em minutos; o corpo mostra ela
  // enquanto dura — encolhido, mancando, sem conseguir fazer mais nada.
  const force = clamp01((speed - ROUGH_SPEED_FLOOR) / 900);
  emotions.pain = clamp01(emotions.pain + 0.4 + force * 0.5);
  if (needs) needs.health = clamp01(needs.health - (violent ? 0.1 : 0.04));

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

  // Encolhe de dor na hora, largando o que estivesse fazendo.
  const behavior = world.store(Behavior).get(id);
  if (behavior) {
    behavior.pose = POSE.hurt;
    behavior.elapsed = 0;
    behavior.duration = 2 + force * 2.5;
    behavior.cooldown = 0;
  }

  witnessTheBlow(world, id, transform.x, transform.y);
}

/**
 * Quem viu, aprendeu.
 *
 * Bater numa criatura não assusta só ela: as outras que estavam por perto e
 * enxergaram a cena passam a desconfiar da mão do jogador, sem nunca terem
 * apanhado. É o mesmo aprendizado por observação que o filhote usa para evitar
 * o cogumelo venenoso sem precisar prová-lo — e é o que faz a crueldade ter
 * preço social, não só individual.
 */
function witnessTheBlow(world: World, victim: number, x: number, y: number): void {
  const transforms = world.store(Transform);
  const attributes = world.store(Attributes);
  const emotionsStore = world.store(Emotions);
  const memories = world.store(Memory);
  const minds = world.store(Mind);

  world.store(Creature).forEach((_tag, entity) => {
    if (entity === victim) return;
    const transform = transforms.get(entity);
    const attrs = attributes.get(entity);
    const emotions = emotionsStore.get(entity);
    if (!transform || !attrs || !emotions) return;

    const distance = Math.hypot(transform.x - x, transform.y - y);
    if (distance > attrs.vision) return;

    // Quanto mais perto da cena, mais forte a lição.
    const clarity = 1 - distance / attrs.vision;
    emotions.fear = clamp01(emotions.fear + 0.3 * clarity);
    emotions.stress = clamp01(emotions.stress + 0.2 * clarity);
    emotions.trust = clamp01(emotions.trust - 0.15 * clarity);

    const memory = memories.get(entity);
    memory?.record(subjects.player(), -0.85, 0.4 * clarity);
    if (clarity > 0.55) {
      memory?.addEpisode({
        text: 'Vi você machucar alguém',
        valence: -0.9,
        intensity: 0.8 * clarity,
        emotion: 'horror',
        tick: world.tick,
        x,
        y,
        actor: 'você',
      });
    }

    const mind = minds.get(entity);
    if (mind) {
      mind.surprise = 1.5;
      mind.commitment = 0;
    }
  });
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

  // A BOLA NÃO SE COME.
  //
  // Este era o buraco por onde a bola sumia: tudo que não fosse `toy` caía no
  // caminho da comida, e o caminho da comida termina em `destroyEntity`.
  // Encostar a bola na criatura ERA dar a bola para ela comer. O mesmo valia
  // para os presentes e para as bugigangas do chão — graveto, pena, pedrinha:
  // ofereceu, sumiu.
  //
  // Oferecer a bola é mostrar o brinquedo: ela se anima e passa a reparar
  // nele. A bola continua no mundo, que é onde uma bola tem de ficar.
  if (item.kind === 'ball') {
    if (emotions.fear > 0.5) return false;
    emotions.happiness = clamp01(emotions.happiness + 0.08);
    needs.play = clamp01(needs.play + 0.25);
    mind.attention = Math.max(mind.attention, 2);
    memory.record(subjects.player(), 0.4, 0.08);
    return true;
  }

  // O PRESENTE também fica. Oferecer é apresentar a coisa: se ela gostar, mais
  // tarde vai buscá-la e guardá-la no canto dela por conta própria.
  if (item.kind === 'gift') {
    if (emotions.fear > 0.5) return false;
    emotions.happiness = clamp01(emotions.happiness + 0.14);
    emotions.loneliness = clamp01(emotions.loneliness - 0.2);
    memory.record(subjects.thing(item.variant), 0.5, 0.2);
    memory.record(subjects.player(), 0.7, 0.2);
    mind.affection = 2.5;
    return true;
  }

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

  // Daqui para baixo é COMIDA — e só fruta é comida. Um graveto, uma pena ou
  // uma concha se pega, se empilha e se esconde, mas não se engole.
  if (item.kind !== 'fruit') return false;

  // Recusa: com medo, sem fome, ou se aprendeu que aquilo faz mal.
  const hungry = needs.hunger > 0.25;
  const trusts = bond > -0.1 || emotions.fear < 0.35;
  if (!hungry || !trusts || opinion < -0.35) return false;

  // A fruta dourada é rara: mata a fome de vez e deixa a criatura radiante.
  const golden = item.variant === VARIANT.goldenFruit;
  needs.hunger = clamp01(needs.hunger - (golden ? 0.85 : 0.3));
  if (golden) emotions.happiness = clamp01(emotions.happiness + 0.3);
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
