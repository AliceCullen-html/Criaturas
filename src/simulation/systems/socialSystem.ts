import { clamp01, subjects } from '@core';
import { Transform, defineResource, type System, type World } from '@engine';
import { Bond, Creature, Emotions, Identity, Memory, Mind, Nest, Needs } from '@creatures';
import { isWaterAt, TerrainResource } from '@world';
import { chronicle } from '../chronicle';

/**
 * VIDA SOCIAL: melhores amigas, desafetos, ninhos e luto.
 *
 * Nada aqui inventa um sistema novo de relacionamento. O grafo social já
 * existia, espalhado dentro da memória associativa: toda vez que duas
 * criaturas brincam, dividem uma fruta ou brigam, uma grava uma opinião sobre
 * a outra. O que faltava era **ler** esse grafo e deixar o mundo agir sobre
 * ele — e é só isso que este sistema faz.
 *
 * O ninho segue a mesma ideia. Não é uma construção nem um objeto: é um LUGAR,
 * escolhido pelo uso. A criatura dorme onde se sente segura e o ninho anda
 * devagar até ali. Quem tem uma melhor amiga puxa o próprio ninho na direção
 * do dela — e é apenas disso que nascem as famílias dormindo juntas. Em nenhum
 * lugar está escrito "durmam em grupo".
 */

/** Quem morreu neste tick. O metabolismo escreve, o luto lê. */
export const DeathsResource = defineResource<number[]>('Deaths');

/** Intervalo entre releituras da memória, em segundos. */
const RECHECK = 3;
/** Abaixo disto não é amizade nem desafeto, é indiferença. */
const BOND_FLOOR = 0.18;

/** O ninho anda devagar: um lar que se move a cada passo não é um lar. */
const NEST_DRIFT = 0.35;
/** O quanto o ninho da amiga puxa o meu, por segundo. */
const FRIEND_PULL = 1.1;
/** Distância a partir da qual não vale mais aproximar os ninhos. */
const NEST_TOGETHER = 42;
/** Ganho de apego por segundo dormindo no lugar certo. */
const ATTACH_RATE = 0.06;

/** Luto: o quanto a morte de uma amiga pesa em quem fica. */
const GRIEF_SADNESS = 0.55;
const GRIEF_RANGE = 260;

export const socialSystem: System = {
  name: 'social',
  update(world, dt) {
    const bonds = world.store(Bond);
    const transforms = world.store(Transform);
    const nests = world.store(Nest);
    const minds = world.store(Mind);
    const needs = world.store(Needs);
    const creatures = world.store(Creature);

    mourn(world, dt);

    creatures.forEach((_tag, self) => {
      let bond = bonds.get(self);
      if (!bond) {
        bond = { friend: -1, friendship: 0, rival: -1, rivalry: 0, recheck: 0 };
        bonds.set(self, bond);
      }

      // ---- Quem eu amo e quem eu evito ---------------------------------
      bond.recheck -= dt;
      if (bond.recheck <= 0) {
        bond.recheck = RECHECK;
        readBond(world, self, bond);
      }

      // ---- O ninho -----------------------------------------------------
      const here = transforms.get(self);
      if (!here) return;
      let nest = nests.get(self);
      if (!nest) {
        // Nasce sem lar: o primeiro canto onde ela dormir vira o dela.
        nest = { x: here.x, y: here.y, attachment: 0 };
        nests.set(self, nest);
      }

      const mind = minds.get(self);
      const tired = needs.get(self);
      const sleeping = mind?.intent === 'sleep';

      if (sleeping) {
        // Dormir aqui aproxima o ninho daqui, e prende um pouco mais o
        // coração da criatura a este canto.
        nest.x += (here.x - nest.x) * Math.min(1, NEST_DRIFT * dt);
        nest.y += (here.y - nest.y) * Math.min(1, NEST_DRIFT * dt);
        nest.attachment = clamp01(nest.attachment + ATTACH_RATE * dt);
      } else if (tired && tired.energy > 0.8) {
        // Bem descansada, ela larga um pouco o apego: um lar que nunca se
        // solta impede a criatura de mudar de vida quando o jardim muda.
        nest.attachment = clamp01(nest.attachment - ATTACH_RATE * 0.12 * dt);
      }

      // O ninho da amiga puxa o meu. É daqui que sai a família.
      if (bond.friend >= 0 && bond.friendship > 0.3) {
        const theirs = nests.get(bond.friend);
        if (theirs) {
          const dx = theirs.x - nest.x;
          const dy = theirs.y - nest.y;
          const distance = Math.hypot(dx, dy);
          if (distance > NEST_TOGETHER) {
            const pull = Math.min(1, FRIEND_PULL * bond.friendship * dt) ;
            const nx = nest.x + dx * pull;
            const ny = nest.y + dy * pull;
            // Nunca dentro da água: ninguém dorme no lago.
            if (!isWaterAt(world.getResource(TerrainResource), nx, ny)) {
              nest.x = nx;
              nest.y = ny;
            }
          }
        }
      }
    });
  },
};

/**
 * Lê a memória e elege a melhor amiga e o maior desafeto.
 *
 * A varredura é sobre os traços que começam com `creature:` — o grafo social
 * inteiro daquela criatura. Só entra quem ainda está viva: a memória de quem
 * morreu continua guardada (é dela que vem o luto), mas não se segue um morto.
 */
function readBond(world: World, self: number, bond: Bond): void {
  const memory = world.store(Memory).get(self);
  const creatures = world.store(Creature);
  bond.friend = -1;
  bond.friendship = 0;
  bond.rival = -1;
  bond.rivalry = 0;
  if (!memory) return;

  memory.forEachAbout('creature:', (subject, trace) => {
    const other = Number(subject.slice('creature:'.length));
    if (!Number.isFinite(other) || other === self || !creatures.has(other)) return;
    const feeling = trace.valence * trace.strength;
    if (feeling > BOND_FLOOR && feeling > bond.friendship) {
      bond.friend = other;
      bond.friendship = clamp01(feeling);
    } else if (feeling < -BOND_FLOOR && -feeling > bond.rivalry) {
      bond.rival = other;
      bond.rivalry = clamp01(-feeling);
    }
  });
}

/**
 * O LUTO.
 *
 * Quem tinha laço com quem morreu fica triste — e guarda a lembrança. É o
 * único acontecimento do jogo que produz uma tristeza que não vem de uma
 * necessidade: não dá para comer nem beber para curá-la, ela passa sozinha,
 * com o tempo. Sem isto uma morte é só um sprite a menos na tela.
 */
function mourn(world: World, _dt: number): void {
  if (!world.hasResource(DeathsResource)) return;
  const deaths = world.getResource(DeathsResource);
  if (deaths.length === 0) return;

  const memories = world.store(Memory);
  const emotions = world.store(Emotions);
  const minds = world.store(Mind);
  const transforms = world.store(Transform);
  const identities = world.store(Identity);
  const bonds = world.store(Bond);

  for (const dead of deaths) {
    const grave = transforms.get(dead);
    const name = identities.get(dead)?.name ?? 'alguém';
    chronicle(world, 'primeira-morte', `A primeira morte do jardim: ${name}`, true);
    chronicle(world, 'morte', `Morreu ${name}`);

    world.store(Creature).forEach((_tag, mourner) => {
      if (mourner === dead) return;
      const memory = memories.get(mourner);
      const feel = emotions.get(mourner);
      if (!memory || !feel) return;

      const attachment = memory.valenceOf(subjects.creature(dead));
      const here = transforms.get(mourner);
      const near =
        grave && here ? Math.hypot(here.x - grave.x, here.y - grave.y) < GRIEF_RANGE : false;
      // Só sente falta quem gostava, ou quem estava perto o bastante para ver.
      if (attachment <= 0.12 && !near) return;

      const weight = clamp01(Math.max(attachment, near ? 0.25 : 0));
      feel.happiness = clamp01(feel.happiness - GRIEF_SADNESS * weight);
      feel.loneliness = clamp01(feel.loneliness + 0.6 * weight);
      feel.stress = clamp01(feel.stress + 0.25 * weight);

      const mind = minds.get(mourner);
      if (mind) {
        mind.commitment = 0;
        // Vai até onde aconteceu. Não é busca: é ir ver.
        if (grave && weight > 0.4) {
          mind.targetX = grave.x;
          mind.targetY = grave.y;
          mind.attention = 3;
        }
      }

      if (weight > 0.3) {
        memory.addEpisode({
          text: `${name} não está mais aqui`,
          valence: -0.9,
          intensity: weight,
          emotion: 'luto',
          tick: world.tick,
          x: grave?.x ?? 0,
          y: grave?.y ?? 0,
          actor: null,
        });
      }

      // O laço com quem morreu deixa de valer para as decisões de hoje.
      const bond = bonds.get(mourner);
      if (bond && bond.friend === dead) bond.recheck = 0;
    });
  }

  deaths.length = 0;
}
