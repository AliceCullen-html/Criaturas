import { clamp01, subjects } from '@core';
import { Transform, type System } from '@engine';
import { Bio, Creature, Emotions, Identity, Memory, Mind, Personality } from '@creatures';
import { CreatureIndexResource } from '../creatureIndex';
import { PlayerResource } from '../player';
import { chronicle } from '../chronicle';
import { isBaby } from '../age';

/**
 * O MEDO SE APRENDE OLHANDO.
 *
 * Este é o sistema que faz a crueldade ter consequência além da vítima. Até
 * aqui, bater numa criatura marcava aquela criatura, e mais nada: as outras
 * continuavam vindo até a sua mão como se nada tivesse acontecido, inclusive
 * as que estavam do lado assistindo. Um jardim assim não tem cultura — tem
 * indivíduos isolados que por acaso dividem o mesmo mapa.
 *
 * Aqui um bicho em pânico é um AVISO. Quem está perto e vê pega um pouco
 * daquele medo; e se a mão do jogador estiver por perto na hora, quem viu
 * aprende de quem é o medo — sem nunca ter sido tocado. É assim que o
 * primeiro filhote que nasce num jardim onde você bate já nasce arisco de
 * você, e é assim que uma reputação atravessa gerações.
 *
 * O filhote aprende muito mais que o adulto, porque é isso que ser filhote é:
 * olhar os outros para descobrir o que é perigoso antes de descobrir na pele.
 */

/** De quão longe se vê o pânico de outro bicho. */
const WATCH_RANGE = 120;
/** Acima deste medo, o outro está visivelmente em pânico. */
const PANIC = 0.55;
/** Medo pego por segundo de observação (adulto). */
const CATCH_RATE = 0.09;
/** O filhote aprende muito mais depressa. */
const BABY_FACTOR = 2.6;
/** E leva junto um tiquinho de trauma — o medo aprendido também marca. */
const CATCH_TRAUMA = 0.012;
/** Até onde a mão do jogador precisa estar para levar a culpa. */
const BLAME_RANGE = 150;
/** O quanto a lembrança do jogador piora por segundo, em quem só assistiu. */
const BLAME_RATE = 0.5;
const nearby: number[] = [];

export const fearLearningSystem: System = {
  name: 'fear-learning',
  update(world, dt) {
    const creatures = world.store(Creature);
    if (creatures.size < 2) return;

    const emotionsStore = world.store(Emotions);
    const transforms = world.store(Transform);
    const memories = world.store(Memory);
    const bios = world.store(Bio);
    const minds = world.store(Mind);
    const identities = world.store(Identity);
    const index = world.hasResource(CreatureIndexResource)
      ? world.getResource(CreatureIndexResource)
      : null;
    const player = world.hasResource(PlayerResource) ? world.getResource(PlayerResource) : null;

    creatures.forEach((_tag, watcher) => {
      const emotions = emotionsStore.get(watcher);
      const here = transforms.get(watcher);
      const bio = bios.get(watcher);
      const memory = memories.get(watcher);
      if (!emotions || !here || !bio || !memory) return;

      // Dormindo não se vê nada, e quem já está em pânico não aprende mais
      // nada com o pânico alheio.
      if (minds.get(watcher)?.intent === 'sleep') return;
      if (emotions.fear > 0.85) return;

      nearby.length = 0;
      if (index) index.query(here.x, here.y, WATCH_RANGE, nearby);
      else creatures.forEach((_t, other) => nearby.push(other));

      // O pior pânico à vista — é dele que se aprende.
      let worst = 0;
      let source = -1;
      for (const other of nearby) {
        if (other === watcher) continue;
        const theirs = emotionsStore.get(other);
        const there = transforms.get(other);
        if (!theirs || !there || theirs.fear < PANIC) continue;
        if (Math.hypot(there.x - here.x, there.y - here.y) > WATCH_RANGE) continue;
        if (theirs.fear > worst) {
          worst = theirs.fear;
          source = other;
        }
      }
      if (source < 0) return;

      // Coragem protege: a destemida repara e segue a vida, a medrosa se
      // contagia inteira. É o mesmo traço que decide se ela foge de um vizinho.
      const baby = isBaby(bio);
      const brave = world.store(Personality).get(watcher)?.bravery ?? 0.5;
      const catching = worst * CATCH_RATE * (baby ? BABY_FACTOR : 1) * (1.4 - brave) * dt;
      emotions.fear = clamp01(emotions.fear + catching);
      emotions.trauma = clamp01(emotions.trauma + catching * CATCH_TRAUMA);

      // DE QUEM É O MEDO.
      //
      // Se a mão do jogador está no meio da cena, quem assistiu aprende que o
      // perigo é ela. Não é acusação automática: só vale quando quem está em
      // pânico JÁ tem uma lembrança ruim sua — a criatura não inventa um
      // culpado, ela confirma o que a outra parece estar dizendo.
      if (!player?.present) return;
      if (Math.hypot(player.x - here.x, player.y - here.y) > BLAME_RANGE) return;
      const theirMemory = memories.get(source);
      if (!theirMemory || theirMemory.valenceOf(subjects.player()) > -0.2) return;

      const before = memory.valenceOf(subjects.player());
      memory.record(subjects.player(), -0.8, BLAME_RATE * catching * (baby ? 1.4 : 1));
      const after = memory.valenceOf(subjects.player());

      // A primeira vez que o medo atravessa de um bicho para outro é um
      // acontecimento do jardim, e vai para o livro. Depois disso vira rotina,
      // e rotina não é notícia.
      if (before > -0.25 && after <= -0.25) {
        const who = identities.get(watcher)?.name ?? '?';
        const from = identities.get(source)?.name ?? '?';
        chronicle(
          world,
          'medo-aprendido',
          `${who} aprendeu a ter medo de você vendo ${from}${baby ? ' — e ainda é filhote' : ''}`,
          true,
        );
        memory.addEpisode({
          text: `Vi ${from} com medo de você`,
          valence: -0.7,
          intensity: 0.6,
          emotion: 'medo',
          tick: world.tick,
          x: here.x,
          y: here.y,
          actor: 'você',
        });
      }
    });
  },
};
