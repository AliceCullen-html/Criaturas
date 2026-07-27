import { EGG_CRACK_AT, clamp01 } from '@core';
import { Transform, type System, type World } from '@engine';
import { Creature, Egg, Emotions, Identity, Lineage, Memory } from '@creatures';
import { chronicle } from '../chronicle';

/**
 * NASCER.
 *
 * O jardim não começa com uma criatura andando: começa com um ovo parado no
 * chão. É a primeira coisa que o jogador vê, e é uma promessa — tem alguém ali
 * dentro, e daqui a pouco vai sair.
 *
 * O ovo tem um relógio, e o relógio anda mais rápido com a **sua mão em cima**.
 * Isso não é um atalho para pular a espera: é a primeira interação possível
 * entre o jogador e uma criatura, e acontece antes de ela existir. Quem chocou o
 * ovo com a mão já fez alguma coisa por aquele bicho — e a criatura sai da casca
 * com uma lembrança boa de você, que é o começo de tudo o que vem depois.
 *
 * Ao romper, a entidade GANHA o marcador `Creature`. Não nasce ninguém novo: é a
 * mesma entidade, com o mesmo nome e o mesmo genoma, que passa a existir para os
 * sistemas do jogo.
 */

/** Quanto o calor da mão multiplica o tempo do ovo. */
const WARM_BOOST = 1.6;
/** Calor que uma passada da mão deixa, por segundo de contato. */
const WARM_PER_SECOND = 0.9;
/** E o quanto ele esfria sozinho, por segundo. */
const COOL_PER_SECOND = 0.35;
/** Quanto a criatura gosta de quem a chocou. */
const HATCH_AFFECTION = 0.45;
/**
 * Quanto tempo dura a casca abrindo quando o jogador manda o ovo nascer.
 *
 * Três segundos: o suficiente para VER a animação, curto o bastante para o
 * clique parecer ter causado aquilo. Zero seria a criatura aparecendo do nada,
 * e o desenho do nascimento não teria para que existir.
 */
const CRACK_SECONDS = 3;

export const eggSystem: System = {
  name: 'egg',
  update(world, dt) {
    const eggs = world.store(Egg);
    if (eggs.size === 0) return;

    const hatched: number[] = [];

    eggs.forEach((egg, entity) => {
      egg.warmth = Math.max(0, egg.warmth - COOL_PER_SECOND * dt);
      egg.time += dt * (1 + Math.min(1, egg.warmth) * WARM_BOOST);
      if (egg.time >= egg.duration) hatched.push(entity);
    });

    for (const entity of hatched) {
      const egg = eggs.get(entity);
      eggs.remove(entity);
      // Aqui ela passa a existir: daqui em diante todos os sistemas a veem.
      world.store(Creature).set(entity, true);

      const name = world.store(Identity).get(entity)?.name ?? '?';
      const lineage = world.store(Lineage).get(entity);
      const primeiro = !lineage || lineage.generation <= 1;
      chronicle(
        world,
        primeiro ? 'primeiro-nascimento' : `nasceu-${entity}`,
        primeiro ? `O primeiro ovo se abriu: ${name} saiu da casca` : `${name} saiu do ovo`,
        primeiro,
      );

      // Quem foi chocado por você já começa gostando de você. É a primeira
      // memória da vida dela, e ela é sua.
      if (egg && egg.warmth > 0.2) {
        world.store(Memory).get(entity)?.record('player', HATCH_AFFECTION, 0.5);
        const emotions = world.store(Emotions).get(entity);
        if (emotions) emotions.trust = clamp01(emotions.trust + 0.25);
      }
    }
  },
};

/**
 * ABRIR AGORA — o primeiro ovo do mundo, no clique.
 *
 * O jogo abre com uma casca no chão e nada mais. Fazer o jogador esperar
 * cinquenta segundos com a mão em cima antes que qualquer coisa aconteça é
 * cobrar paciência de quem ainda não tem motivo nenhum para ter: ele não
 * conhece ninguém ali dentro. Então o primeiro ovo nasce quando ele toca.
 *
 * Chocar com a mão continua existindo — e passa a valer para os ovos que vêm
 * depois, quando o jardim já tem gente e o jogador já sabe por que esperar.
 *
 * Não nasce no ato: o relógio é reescrito para que sobrem três segundos, que é
 * a casca rachando na frente de quem clicou.
 */
export function hatchNow(world: World, entity: number): boolean {
  const egg = world.store(Egg).get(entity);
  if (!egg) return false;
  // A animação ocupa a última fatia da espera; o relógio inteiro é redesenhado
  // para que essa fatia dure `CRACK_SECONDS`.
  egg.duration = CRACK_SECONDS / (1 - EGG_CRACK_AT);
  egg.time = egg.duration - CRACK_SECONDS;
  // Nasceu porque você quis: ela sai da casca gostando de você.
  egg.warmth = Math.max(egg.warmth, 1);
  return true;
}

/** A mão do jogador parada sobre o ovo: esquenta. */
export function warmEgg(world: World, entity: number, dt: number): boolean {
  const egg = world.store(Egg).get(entity);
  if (!egg) return false;
  egg.warmth = clamp01(egg.warmth + WARM_PER_SECOND * dt);
  return true;
}

/** Aquela entidade ainda está na casca? */
export const isEgg = (world: World, entity: number): boolean =>
  world.hasComponent(Egg) && world.store(Egg).has(entity);

/** O quanto falta para romper, de 0 (recém-posto) a 1 (saindo). */
export function hatchProgress(world: World, entity: number): number {
  const egg = world.store(Egg).get(entity);
  return egg ? clamp01(egg.time / egg.duration) : 0;
}

/** Onde estão os ovos — o renderer precisa desenhá-los. */
export function forEachEgg(
  world: World,
  visit: (entity: number, progress: number, x: number, y: number) => void,
): void {
  if (!world.hasComponent(Egg)) return;
  const transforms = world.store(Transform);
  world.store(Egg).forEach((egg, entity) => {
    const spot = transforms.get(entity);
    if (spot) visit(entity, clamp01(egg.time / egg.duration), spot.x, spot.y);
  });
}
