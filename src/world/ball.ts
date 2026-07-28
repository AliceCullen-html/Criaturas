import { clamp } from '@core';
import { defineComponent, type System, type World } from '@engine';
import { Item, VARIANT } from './items';

/**
 * A BOLA QUICA.
 *
 * Todo o resto do jardim vive achatado no chão: uma fruta rola, uma pedra fica.
 * A bola é a única coisa que sai do chão, e é isso que a torna um brinquedo —
 * uma coisa que só faz sentido enquanto se mexe.
 *
 * A altura vive aqui e não no `Transform` de propósito. `Transform` é a posição
 * no MUNDO, e é ela que a colisão, a percepção e a memória de lugar usam; a
 * altura é uma terceira dimensão que só existe para o desenho e para o salto.
 * Misturar as duas faria a criatura procurar a bola no lugar errado enquanto ela
 * estivesse no ar.
 */

export interface Ball {
  /** Altura acima do chão, em pixels de mundo. */
  z: number;
  /**
   * A altura do tique anterior, guardada só para o desenho.
   *
   * A simulação anda a 20 Hz e a tela a 60: sem isto, a bola subiria aos
   * saltos, três quadros parada e um pulando. É o mesmo `prevX`/`prevY` do
   * `Transform`, aplicado à terceira dimensão.
   */
  prevZ: number;
  /** Velocidade vertical. */
  vz: number;
  /** Relógio do rolamento, avança com a distância percorrida. */
  roll: number;
  /** Segundos restantes do quadro de impacto — o esmagado ao bater no chão. */
  hit: number;
}

export const Ball = defineComponent<Ball>('Ball');

/**
 * Gravidade, em pixels de mundo por segundo ao quadrado.
 *
 * Bem mais fraca que a da Terra de propósito. Com gravidade "certa" a bola
 * cumpria todo o quique em um terço de segundo: no papel a física estava
 * perfeita e na tela a bola parecia colada no chão. O que importa aqui não é
 * a aceleração real, é o TEMPO DE VOO — ele precisa durar o bastante para o
 * olho acompanhar e para a criatura decidir ir atrás.
 */
const GRAVITY = 420;
/**
 * O quanto ela devolve a cada quique.
 *
 * Uma bola de brinquedo, nem pedra nem bola de basquete. Com 0,45 ela dava um
 * quique de cinco pixels e assentava — invisível. Com 0,62 ela pula quatro
 * vezes, cada uma pouco mais da metade da anterior, e leva uns dois segundos
 * para descansar: dá tempo de ver e dá vontade de correr atrás.
 */
const RESTITUTION = 0.62;
/** Abaixo disto ela para de quicar e passa a rolar. */
const REST_SPEED = 26;
/** Quanto tempo dura o quadro de esmagado. */
const HIT_TIME = 0.09;
/** Um quadro de rolamento a cada tantos pixels percorridos. */
const ROLL_PER_PIXEL = 1 / 9;

/** Dá um empurrão na bola — de uma criatura, de um arremesso ou de um chute. */
export function kickBall(world: World, entity: number, up: number): void {
  if (!world.hasComponent(Ball)) return;
  const ball = world.store(Ball).get(entity);
  if (ball) ball.vz = Math.max(ball.vz, up);
}

export const ballSystem: System = {
  name: 'ball',
  update(world, dt) {
    if (!world.hasComponent(Ball)) return;
    const balls = world.store(Ball);
    if (balls.size === 0) return;
    const items = world.store(Item);

    balls.forEach((ball, entity) => {
      const item = items.get(entity);
      if (!item) return;

      ball.prevZ = ball.z;
      if (ball.hit > 0) ball.hit = Math.max(0, ball.hit - dt);

      // Na mão do jogador ela fica suspensa, parada: quem segura, segura.
      if (item.held) {
        ball.z = 0;
        ball.vz = 0;
        return;
      }

      // Voo.
      if (ball.z > 0 || ball.vz > 0) {
        ball.vz -= GRAVITY * dt;
        ball.z += ball.vz * dt;
        if (ball.z <= 0) {
          ball.z = 0;
          // Bateu: devolve parte, e perde um pouco da corrida horizontal
          // também — uma bola que bate no chão não sai do quique com a mesma
          // velocidade de antes.
          ball.vz = -ball.vz * RESTITUTION;
          item.vx *= 0.82;
          item.vy *= 0.82;
          ball.hit = HIT_TIME;
          if (ball.vz < REST_SPEED) ball.vz = 0;
        }
      }

      // Rolando: o relógio anda com a distância, como o passo da criatura.
      const speed = Math.hypot(item.vx, item.vy);
      ball.roll += speed * dt * ROLL_PER_PIXEL;
      ball.z = clamp(ball.z, 0, 400);
    });
  },
};

/**
 * O QUADRO DA BOLA, dado o estado dela.
 *
 * Os seis desenhos da ficha, na ordem em que ela os nomeia: no ar, caindo,
 * impacto, subindo, rola 1, rola 2. A escolha mora aqui, no mundo, e não no
 * renderer, porque quem sabe se a bola está subindo é a física — o desenho só
 * obedece.
 */
export function ballVariant(ball: Ball, speed: number): number {
  if (ball.hit > 0) return VARIANT.ballHit;
  if (ball.z > 2) {
    if (ball.vz > 40) return VARIANT.ballRise;
    if (ball.vz < -40) return VARIANT.ballFall;
    return VARIANT.ballAir;
  }
  if (speed > 6) return Math.floor(ball.roll) % 2 === 0 ? VARIANT.ballRoll1 : VARIANT.ballRoll2;
  return VARIANT.ball;
}
