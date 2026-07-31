import { POSE, POSE_DURATION, clamp01, subjects } from '@core';
import { Transform, type System, type World } from '@engine';
import {
  Attributes,
  Behavior,
  Bio,
  Creature,
  Emotions,
  Identity,
  Memory,
  Mind,
  Needs,
  Personality,
} from '@creatures';
import {
  Ball,
  Item,
  Plant,
  RESOURCE_NAMES,
  isToxicVariant,
  itemRadius,
  radiusForBiomass,
} from '@world';
import { isBaby } from '../age';
import { CreatureIndexResource } from '../creatureIndex';

const EAT_RATE = 3.2;
const NUTRITION = 0.21;
const PLANT_MIN_BIOMASS = 0.4;
const TOXIN_DAMAGE = 0.22;
const INTERACT_COOLDOWN = 2.5;
/**
 * Quanto de vontade de brincar sai a cada brincadeira.
 *
 * Um décimo: são umas dez trocas de bola até a satisfação, o que dura menos de
 * um minuto de jardim e é mais ou menos o tempo em que uma brincadeira ainda é
 * bonita de ver. Depois disso ela larga a bola por conta própria.
 */
const PLAY_SATED = 0.1;
/**
 * Quanta curiosidade sai por segundo de olhar uma coisa.
 *
 * Um quinto por segundo: cinco segundos de borboleta e a curiosidade de uma
 * criatura curiosa já caiu à metade — tempo de sobra para a cena ser vista, e
 * pouco para ela virar um poste. A curiosidade volta a subir a 0,05 por segundo
 * no `emotionSystem`, então a próxima olhada demora um minuto ou dois.
 */
const WATCH_SATED = 0.2;
/**
 * A que distância do alvo ela já está OLHANDO.
 *
 * O mesmo número que o `decisionSystem` usa para parar de andar quando a
 * intenção é observar: ninguém persegue uma borboleta até encostar nela.
 */
const WATCH_REACH = 36;
/** Faixa junto à borda do mundo onde o empurrão passa a apontar para dentro. */
const EDGE = 60;

const eaten: number[] = [];

/** De quão longe um adulto já basta para o filhote se sentir seguro. */
const GROWNUP_RANGE = 120;
/** O medo que o abandono acrescenta por segundo. */
const BABY_ALONE_FEAR = 0.01;
const grownUps: number[] = [];

/** Há um adulto por perto deste filhote? */
function grownUpNear(world: World, baby: number): boolean {
  if (!world.hasResource(CreatureIndexResource)) return true;
  const here = world.store(Transform).get(baby);
  if (!here) return true;
  grownUps.length = 0;
  world.getResource(CreatureIndexResource).query(here.x, here.y, GROWNUP_RANGE, grownUps);
  const bios = world.store(Bio);
  for (const other of grownUps) {
    if (other === baby) continue;
    const bio = bios.get(other);
    if (bio && !isBaby(bio)) return true;
  }
  return false;
}

/**
 * Executa a intenção quando a criatura chega ao alvo, e — o mais importante —
 * registra a **consequência** na memória. É o elo que transforma experiência
 * em comportamento futuro.
 */
export const actionSystem: System = {
  name: 'action',
  update(world, dt) {
    const creatures = world.store(Creature);
    const transforms = world.store(Transform);
    const needsStore = world.store(Needs);
    const emotionsStore = world.store(Emotions);
    const attributesStore = world.store(Attributes);
    const traitsStore = world.store(Personality);
    const minds = world.store(Mind);
    const memories = world.store(Memory);
    const identities = world.store(Identity);
    const bios = world.store(Bio);
    const behaviors = world.store(Behavior);
    const plants = world.store(Plant);
    const items = world.store(Item);

    eaten.length = 0;

    creatures.forEach((_tag, entity) => {
      const mind = minds.get(entity);
      const transform = transforms.get(entity);
      const memory = memories.get(entity);
      const needs = needsStore.get(entity);
      const emotions = emotionsStore.get(entity);
      const attributes = attributesStore.get(entity);
      if (!mind || !transform || !memory || !needs || !emotions || !attributes) return;

      switch (mind.intent) {
        case 'seekFood': {
          const foodId = mind.targetEntity;
          const foodTransform = transforms.get(foodId);
          if (!foodTransform) break;
          const plant = plants.get(foodId);
          const item = items.get(foodId);
          if (!plant && !item) break;
          if (item?.held) {
            mind.commitment = 0;
            break;
          }

          const foodRadius = plant ? radiusForBiomass(plant.biomass) : itemRadius(item!);
          const distance = Math.hypot(foodTransform.x - transform.x, foodTransform.y - transform.y);
          if (distance > attributes.size + foodRadius + 2) break;

          const variant = plant ? plant.variant : item!.variant;
          const toxic = plant ? isToxicVariant(variant) : item!.toxic;
          const bite = Math.min(EAT_RATE * dt, plant ? plant.biomass : 5 * item!.freshness);
          // COMENDO: a boca abre e fecha enquanto a mordida acontece. A pose é
          // reposta a cada tique e dura meio segundo além da última mordida —
          // assim a animação existe enquanto a refeição existe, sem que ninguém
          // precise cronometrar nada.
          const behavior = behaviors.get(entity);
          if (behavior) {
            behavior.pose = POSE.eat;
            behavior.elapsed = 0;
            behavior.duration = POSE_DURATION[POSE.eat] ?? 0.8;
          }
          if (plant) plant.biomass -= bite;
          needs.hunger = clamp01(needs.hunger - bite * NUTRITION);

          if (toxic) {
            // Consequência ruim → memória negativa forte daquele alimento.
            needs.health = clamp01(needs.health - TOXIN_DAMAGE * bite);
            emotions.stress = clamp01(emotions.stress + 0.35 * bite);
            emotions.happiness = clamp01(emotions.happiness - 0.2 * bite);
            memory.record(subjects.food(variant), -1, 0.5 * bite);
            if (bite > 0.05) {
              memory.addEpisode({
                text: `Comi ${nameOf(variant)} e passei mal`,
                valence: -0.8,
                intensity: 0.75,
                emotion: 'mal-estar',
                tick: world.tick,
                x: transform.x,
                y: transform.y,
              });
            }
          } else {
            memory.record(subjects.food(variant), 0.6, 0.25 * bite);
            emotions.happiness = clamp01(emotions.happiness + 0.05 * bite);
          }

          // Uma fruta é consumida de uma vez; uma planta, aos poucos.
          if (item || (plant && plant.biomass <= PLANT_MIN_BIOMASS)) {
            eaten.push(foodId);
            mind.commitment = 0;
          }
          break;
        }

        case 'attack': {
          const targetId = mind.targetEntity;
          if (targetId < 0 || mind.actionCooldown > 0) break;
          const targetTransform = transforms.get(targetId);
          const targetNeeds = needsStore.get(targetId);
          const targetEmotions = emotionsStore.get(targetId);
          const targetMemory = memories.get(targetId);
          const targetBio = bios.get(targetId);
          if (!targetTransform || !targetNeeds || !targetEmotions || !targetMemory || !targetBio)
            break;
          const distance = Math.hypot(
            targetTransform.x - transform.x,
            targetTransform.y - transform.y,
          );
          if (distance > attributes.size + 6) break;

          targetNeeds.health = clamp01(targetNeeds.health - attributes.strength * 0.12);
          targetEmotions.fear = clamp01(targetEmotions.fear + 0.45);
          targetEmotions.stress = clamp01(targetEmotions.stress + 0.3);
          targetEmotions.anger = clamp01(targetEmotions.anger + 0.25);
          emotions.anger = clamp01(emotions.anger - 0.2);

          // A vítima aprende: aquele indivíduo e aquele lugar são perigosos.
          targetMemory.record(subjects.creature(entity), -0.9, 0.6);
          targetMemory.record(subjects.place(targetTransform.x, targetTransform.y), -0.7, 0.4);
          targetEmotions.trauma = clamp01(targetEmotions.trauma + 0.08);
          targetMemory.addEpisode({
            text: `${nameFor(identities, entity)} me atacou`,
            valence: -0.9,
            intensity: 0.85,
            emotion: 'pânico',
            tick: world.tick,
            x: targetTransform.x,
            y: targetTransform.y,
            actor: nameFor(identities, entity),
          });
          memory.record(subjects.creature(targetId), -0.3, 0.2);
          mind.actionCooldown = INTERACT_COOLDOWN;
          mind.commitment = 0;
          break;
        }

        case 'play': {
          const targetId = mind.targetEntity;
          if (targetId < 0 || mind.actionCooldown > 0) break;

          // BRINCAR COM A BOLA.
          //
          // O mesmo "brincar" serve para os dois casos, e o alvo decide qual:
          // uma criatura brinca com outra criatura ou com a bola. Um segundo
          // caso separado no `switch` seria a mesma intenção com dois nomes.
          //
          // O empurrão sai na direção em que ela chegou, não num rumo sorteado:
          // é o corpo dela que joga. E a bola empurrada rola, quica e vai parar
          // longe — é isso que faz a brincadeira continuar sozinha.
          if (world.hasComponent(Ball)) {
            const ball = world.store(Ball).get(targetId);
            const ballItem = items.get(targetId);
            const ballSpot = transforms.get(targetId);
            if (ball && ballItem && ballSpot && !ballItem.held) {
              const reach = Math.hypot(ballSpot.x - transform.x, ballSpot.y - transform.y);
              if (reach > attributes.size + 12) break;
              const away = reach > 0.001 ? 1 / reach : 0;
              const force = 90 + attributes.strength * 60;
              let pushX = (ballSpot.x - transform.x) * away;
              let pushY = (ballSpot.y - transform.y) * away;

              // A BOLA NÃO VAI CONTRA A PAREDE DO MUNDO.
              //
              // Este era o buraco: com a bola encostada na beirada do jardim, o
              // empurrão saía sempre para fora — a bola não andava, a criatura
              // ia atrás, empurrava de novo, e ficava ali até cair de cansaço.
              // Medido: dois minutos no canto, sete pixels percorridos. Não era
              // uma brincadeira, era um bicho empurrando uma parede.
              //
              // Quem está com a bola encurralada dá a volta e joga para dentro,
              // que é o que qualquer um faria. O empurrão que iria para fora é
              // espelhado — a criatura passou para o outro lado dela.
              const { width, height } = world.config;
              if ((ballSpot.x < EDGE && pushX < 0) || (ballSpot.x > width - EDGE && pushX > 0)) {
                pushX = -pushX;
              }
              if ((ballSpot.y < EDGE && pushY < 0) || (ballSpot.y > height - EDGE && pushY > 0)) {
                pushY = -pushY;
              }
              ballItem.vx += pushX * force;
              ballItem.vy += pushY * force;
              // O empurrão também LEVANTA a bola. Não é um chute calculado: é
              // um bicho batendo com o corpo numa coisa redonda, e coisa
              // redonda que apanha sobe. Quem é mais forte manda mais longe e
              // mais alto — dá para ver a diferença entre um filhote e um
              // adulto sem nenhum número na tela.
              ball.vz = Math.max(ball.vz, 130 + attributes.strength * 70);
              mind.actionCooldown = 0.9;

              // Brincar é bom, e fica na lembrança: é daqui que sai a criatura
              // que vem correndo quando você larga a bola.
              //
              // E SACIA. Cada empurrão gasta um pedaço da vontade de brincar —
              // umas dez trocas de bola e ela está satisfeita, sai da bola e
              // vai fazer outra coisa. Sem isto a bola era a única coisa do
              // jardim de que ninguém se cansava: a criatura ficava num canto
              // empurrando até a energia acabar, esquecida do mundo.
              emotions.happiness = clamp01(emotions.happiness + 0.06);
              emotions.loneliness = clamp01(emotions.loneliness - 0.05);
              needs.energy = clamp01(needs.energy - 0.01);
              needs.play = clamp01(needs.play - PLAY_SATED);
              memory.record(subjects.player(), 0.12, 0.05);
              if (world.rng.chance(0.06)) {
                memory.addEpisode({
                  text: 'Brinquei com a bola',
                  valence: 0.7,
                  intensity: 0.45,
                  emotion: 'alegria',
                  tick: world.tick,
                  x: transform.x,
                  y: transform.y,
                });
              }
              break;
            }
          }

          const targetTransform = transforms.get(targetId);
          const targetEmotions = emotionsStore.get(targetId);
          const targetMemory = memories.get(targetId);
          if (!targetTransform || !targetEmotions || !targetMemory) break;
          const distance = Math.hypot(
            targetTransform.x - transform.x,
            targetTransform.y - transform.y,
          );
          if (distance > attributes.size + 10) break;

          const traits = traitsStore.get(entity);
          const joy = 0.18 * (0.6 + (traits?.playfulness ?? 0.5));
          emotions.happiness = clamp01(emotions.happiness + joy);
          emotions.loneliness = clamp01(emotions.loneliness - 0.4);
          targetEmotions.happiness = clamp01(targetEmotions.happiness + joy * 0.8);
          targetEmotions.loneliness = clamp01(targetEmotions.loneliness - 0.35);

          // Brincar com outra criatura sacia as duas: quem brinca junto se
          // satisfaz junto.
          needs.play = clamp01(needs.play - PLAY_SATED);
          const targetNeeds = needsStore.get(targetId);
          if (targetNeeds) targetNeeds.play = clamp01(targetNeeds.play - PLAY_SATED * 0.8);

          // Brincar cria amizade nos dois lados.
          memory.record(subjects.creature(targetId), 0.7, 0.3);
          targetMemory.record(subjects.creature(entity), 0.7, 0.3);
          memory.addEpisode({
            text: `Brinquei com ${nameFor(identities, targetId)}`,
            valence: 0.7,
            intensity: 0.5,
            emotion: 'alegria',
            tick: world.tick,
            x: transform.x,
            y: transform.y,
            actor: nameFor(identities, targetId),
          });
          mind.actionCooldown = INTERACT_COOLDOWN;
          break;
        }

        case 'sunbathe': {
          // TOMAR SOL DESCANSA — e é isso que a faz levantar depois.
          //
          // Sem consequência nenhuma, deitar no sol era um poço: a vontade vinha
          // do cansaço e o cansaço não passava, então ela ficava. Um décimo de
          // energia por segundo é pouco para substituir o sono e bastante para,
          // em meia dúzia de segundos de sol, a vontade de deitar perder de
          // qualquer outra coisa que o jardim ofereça.
          needs.energy = clamp01(needs.energy + 0.1 * dt);
          emotions.happiness = clamp01(emotions.happiness + 0.03 * dt);
          emotions.stress = clamp01(emotions.stress - 0.08 * dt);
          break;
        }

        case 'watch': {
          // OLHAR TAMBÉM SACIA.
          //
          // Observar uma borboleta era a única coisa do jardim que não acabava:
          // a nota de `watch` sai da curiosidade, e a curiosidade voltava sozinha
          // sem que olhar gastasse nada. Uma criatura curiosa perto de uma
          // borboleta ficava PARADA olhando, e medido no jardim isso dava vinte
          // e oito por cento da vida dela — meio minuto seguido sem se mexer,
          // sempre o mesmo desenho. Era a cara de um jogo travado.
          //
          // É a mesma cura da bola: a curiosidade é GASTA no que se olha. Ela
          // olha, se satisfaz, vai fazer outra coisa — e a curiosidade volta em
          // um ou dois minutos, que é quando a próxima borboleta ganha uma
          // olhada de novo. Um jardim onde tudo se sacia é um jardim que se move.
          //
          // Olhar sem pressa também acalma: quem para para ver uma borboleta
          // passar fica um pouco melhor do que estava.
          //
          // E só conta depois de CHEGAR: o caminho até a borboleta é caminhada,
          // não contemplação. Sem isto ela se saciava andando e desistia antes de
          // ter visto qualquer coisa.
          if (Math.hypot(mind.targetX - transform.x, mind.targetY - transform.y) > WATCH_REACH) {
            break;
          }
          emotions.curiosity = clamp01(emotions.curiosity - WATCH_SATED * dt);
          emotions.happiness = clamp01(emotions.happiness + 0.02 * dt);
          emotions.stress = clamp01(emotions.stress - 0.05 * dt);
          break;
        }

        case 'socialize': {
          const targetId = mind.targetEntity;
          if (targetId < 0) break;
          const targetTransform = transforms.get(targetId);
          if (!targetTransform) break;
          const distance = Math.hypot(
            targetTransform.x - transform.x,
            targetTransform.y - transform.y,
          );
          if (distance > attributes.size + 14) break;
          emotions.loneliness = clamp01(emotions.loneliness - 0.25 * dt);
          memory.record(subjects.creature(targetId), 0.2, 0.05 * dt);
          break;
        }

        case 'share': {
          const targetId = mind.targetEntity;
          if (targetId < 0 || mind.actionCooldown > 0) break;
          const targetNeeds = needsStore.get(targetId);
          const targetTransform = transforms.get(targetId);
          const targetMemory = memories.get(targetId);
          if (!targetNeeds || !targetTransform || !targetMemory) break;
          const distance = Math.hypot(
            targetTransform.x - transform.x,
            targetTransform.y - transform.y,
          );
          if (distance > attributes.size + 10) break;
          if (targetNeeds.hunger < 0.3 || needs.hunger > 0.5) break;

          const given = 0.18;
          needs.hunger = clamp01(needs.hunger + given * 0.6);
          targetNeeds.hunger = clamp01(targetNeeds.hunger - given);
          targetMemory.record(subjects.creature(entity), 0.9, 0.5);
          targetMemory.addEpisode({
            text: `${nameFor(identities, entity)} dividiu comida comigo`,
            valence: 0.9,
            intensity: 0.7,
            emotion: 'gratidão',
            tick: world.tick,
            x: targetTransform.x,
            y: targetTransform.y,
            actor: nameFor(identities, entity),
          });
          memory.record(subjects.creature(targetId), 0.4, 0.2);
          emotions.happiness = clamp01(emotions.happiness + 0.08);
          mind.actionCooldown = INTERACT_COOLDOWN * 2;
          break;
        }

        case 'flee': {
          // Fugir marca o lugar de onde se fugiu como desagradável.
          memory.record(subjects.place(transform.x, transform.y), -0.25, 0.05 * dt);
          break;
        }

        default:
          break;
      }

      // FILHOTE SOZINHO FICA COM MEDO — e só o sozinho.
      //
      // O comentário aqui já dizia "longe dos adultos", e o código não conferia
      // nada: TODO filhote ganhava medo o tempo todo, estivesse ele encostado na
      // mãe ou perdido no mato. Medido, o efeito era um piso permanente de 0,26
      // de medo em todo filhote do jardim — logo acima do ponto em que um bicho
      // deixa de parecer tranquilo aos olhos dos outros. Num jardim que se
      // duplica, e que por isso vive cheio de filhotes, isso é uma fonte de
      // medo que nunca desliga e que apagava a calma do bando inteiro.
      const bio = bios.get(entity);
      if (bio && isBaby(bio) && !grownUpNear(world, entity)) {
        emotions.fear = clamp01(emotions.fear + BABY_ALONE_FEAR * dt);
      }
    });

    for (let i = 0; i < eaten.length; i++) world.destroyEntity(eaten[i]!);
  },
};

const nameOf = (variant: number): string => RESOURCE_NAMES[variant] ?? 'algo';

function nameFor(
  identities: { get(id: number): { name: string } | undefined },
  id: number,
): string {
  return identities.get(id)?.name ?? 'alguém';
}
