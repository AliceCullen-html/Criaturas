import { POSE, clamp01, subjects } from '@core';
import { type System, type World } from '@engine';
import { Behavior, Carried, Emotions, Falling, Memory, Mind } from '@creatures';
import { CARRY_HEIGHT, CARRY_PATIENCE } from '../handActions';

/**
 * O TEMPO NO COLO, A SACUDIDA E A QUEDA.
 *
 * Pegar um bicho no ar é gostoso para quem pega. Para quem é pego, é gostoso
 * por uns segundos — e depois vira aflição. Um sistema de meia centena de
 * linhas é o que separa "o jogador pode pegar a criatura" de "o jogador pode
 * pegar a criatura, e ela tem opinião sobre isso".
 *
 * E é aqui que ela DESCE. Soltar uma criatura no ar e vê-la aparecer no chão no
 * mesmo quadro é o oposto de um jogo com peso: ela cai, encosta e se sacode.
 * A altura é de tela, não de mundo — o jardim é plano, e a terceira dimensão
 * aqui é a mesma da bola: desenho.
 */

/** Aceleração da queda, em pixels de tela por segundo ao quadrado. */
const GRAVITY = 340;
/** Acima disto, o tombo dói em vez de só assustar. */
const HARD_LANDING = 150;
/** Acima disto, a criatura está sendo chacoalhada, não carregada. */
const SHAKEN_ENOUGH = 0.45;
/** O quanto a medida de chacoalho cede por segundo de mão quieta. */
const SHAKE_CALM = 0.9;
/** Quão depressa ela sobe para a mão. Não é teletransporte: é um gesto. */
const RISE = 9;
/**
 * O teto do medo que a sacudida sozinha alcança.
 *
 * Abaixo do limiar em que a criatura entra em estado de FUGA (0,55): chacoalhar
 * deixa o bicho aflito e querendo descer, não em pânico permanente. O que faz
 * uma criatura viver com medo é o trauma acumulado, e esse sobe devagar.
 */
const SHAKE_FEAR_CAP = 0.5;

export const carrySystem: System = {
  name: 'carry',
  update(world, dt) {
    if (world.hasComponent(Carried)) inTheHand(world, dt);
    if (world.hasComponent(Falling)) inTheAir(world, dt);
  },
};

function inTheHand(world: World, dt: number): void {
  const emotions = world.store(Emotions);
  const minds = world.store(Mind);
  const memories = world.store(Memory);

  world.store(Carried).forEach((carried, entity) => {
    carried.time += dt;
    carried.shaken = Math.max(0, carried.shaken - SHAKE_CALM * dt);
    // ELA SOBE. Aparecer erguida no quadro seguinte é um salto de dezoito
    // pixels que o olho pega; um quarto de segundo de subida é um gesto.
    carried.prevZ = carried.z;
    carried.z += (CARRY_HEIGHT - carried.z) * Math.min(1, RISE * dt);
    const emotion = emotions.get(entity);
    const mind = minds.get(entity);
    // No ar ela não decide nada: não há para onde ir.
    if (mind) mind.commitment = 0;
    if (!emotion) return;

    // SACUDIR NÃO É CARREGAR. Levar o bicho de um lado para o outro é uma
    // coisa; chacoalhar é outra, e nenhum bicho do mundo acha isso engraçado.
    //
    // MAS A DOSE ESTAVA ABSURDA. Era medo a 0,35 POR SEGUNDO — três segundos de
    // chacoalho equivaliam a dez tapas, e o medo, que cede devagar de
    // propósito, empurrava a criatura para um pavor de dois minutos e meio.
    // Quem sacudiu uma vez para ver a animação ficou com um bicho apavorado e
    // chorando pelo resto da partida. Agora é assim:
    //
    // - o medo sobe devagar e TEM TETO: sacudir aflige, não traumatiza de uma
    //   vez, e sozinho nunca joga a criatura no pavor de fuga;
    // - o que ACUMULA entre uma sacudida e outra é o trauma, que é o lugar
    //   certo para a repetição pesar — quem faz isso sempre deixa marca, quem
    //   fez uma vez é perdoado.
    if (carried.shaken > SHAKEN_ENOUGH) {
      if (emotion.fear < SHAKE_FEAR_CAP) {
        emotion.fear = Math.min(SHAKE_FEAR_CAP, emotion.fear + 0.12 * dt);
      }
      emotion.stress = clamp01(emotion.stress + 0.3 * dt);
      emotion.trauma = clamp01(emotion.trauma + 0.02 * dt);
      emotion.trust = clamp01(emotion.trust - 0.03 * dt);
      emotion.happiness = clamp01(emotion.happiness - 0.15 * dt);
      memories.get(entity)?.record(subjects.player(), -0.6, 0.08 * dt);
      return;
    }

    if (carried.time <= CARRY_PATIENCE) {
      // Os primeiros segundos são colo: calma, se ela não tem nada contra
      // você. É a mesma correção do susto ao ser pega — medir confiança
      // castigava o bicho recém-nascido, que ainda não teve tempo de confiar
      // em ninguém e por isso passava o jogo inteiro apavorado.
      const welcome = emotion.scar < 0.3 && emotion.trauma < 0.3;
      emotion.fear = clamp01(emotion.fear - (welcome ? 0.05 : -0.02) * dt);
      emotion.happiness = clamp01(emotion.happiness + (welcome ? 0.03 : -0.02) * dt);
      return;
    }

    // Passou da conta: ela quer descer.
    emotion.fear = clamp01(emotion.fear + 0.06 * dt);
    emotion.stress = clamp01(emotion.stress + 0.09 * dt);
    emotion.trust = clamp01(emotion.trust - 0.015 * dt);
    emotion.happiness = clamp01(emotion.happiness - 0.05 * dt);
  });
}

function inTheAir(world: World, dt: number): void {
  const falling = world.store(Falling);
  const emotions = world.store(Emotions);
  const behaviors = world.store(Behavior);
  const landed: number[] = [];

  falling.forEach((fall, entity) => {
    fall.prevZ = fall.z;
    fall.vz += GRAVITY * dt;
    fall.z -= fall.vz * dt;
    // Subiu? Então o arremesso ainda está no arco de ida, e a altura de queda
    // passa a ser de onde ela realmente vai cair.
    if (fall.z > fall.from) fall.from = fall.z;
    if (fall.z <= 0) landed.push(entity);
  });

  for (const entity of landed) {
    const fall = falling.get(entity)!;
    const hard = fall.vz > HARD_LANDING;
    falling.remove(entity);

    // O CORPO RESPONDE AO CHÃO. Tombo forte dói e derruba; queda de brincadeira
    // rende uma sacudida e a vida continua.
    const behavior = behaviors.get(entity);
    if (behavior) {
      behavior.pose = hard ? POSE.hurt : POSE.shake;
      behavior.elapsed = 0;
      behavior.duration = hard ? 2 : 1.1;
      behavior.cooldown = 0;
    }
    if (hard) {
      const emotion = emotions.get(entity);
      if (emotion) {
        emotion.pain = clamp01(emotion.pain + 0.25);
        emotion.fear = clamp01(emotion.fear + 0.15);
      }
    }
  }
}
