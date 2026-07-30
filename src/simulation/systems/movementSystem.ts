import { Transform, Velocity, type System } from '@engine';
import { Carried, Falling, Mind } from '@creatures';
import { TerrainResource, isWaterAt } from '@world';
import { solids } from '../solids';

/**
 * Integra a posição a partir da velocidade, respeitando o que é sólido.
 *
 * São dois obstáculos: a água do lago e as pedras grandes que o jogador
 * empurra. Ao esbarrar em qualquer um dos dois, a criatura tenta deslizar pelo
 * eixo livre em vez de travar de frente — é isso que faz ela contornar a
 * margem naturalmente, e o que exige que uma parede de pedras esteja mesmo
 * fechada para prender alguém.
 */
export const movementSystem: System = {
  name: 'movement',
  update(world, dt) {
    const transforms = world.store(Transform);
    const velocities = world.store(Velocity);
    const minds = world.store(Mind);
    // Quem está no colo não anda: quem a move é a mão. Uma linha aqui, e não
    // uma exceção em cada sistema — é o mesmo princípio do ovo, que não é
    // criatura e por isso passa direto por todos eles.
    const carried = world.hasComponent(Carried) ? world.store(Carried) : null;
    // E quem está caindo também não: no ar não há chão para empurrar.
    const falling = world.hasComponent(Falling) ? world.store(Falling) : null;
    const terrain = world.getResource(TerrainResource);
    const { width, height } = world.config;

    solids.rebuild(world);

    transforms.forEach((transform, entity) => {
      const velocity = velocities.get(entity);
      if (!velocity) return;
      if (carried?.has(entity) || falling?.has(entity)) {
        velocity.x = 0;
        velocity.y = 0;
        return;
      }
      if (velocity.x === 0 && velocity.y === 0) {
        transform.prevX = transform.x;
        transform.prevY = transform.y;
        return;
      }

      transform.prevX = transform.x;
      transform.prevY = transform.y;

      const nextX = clampTo(transform.x + velocity.x * dt, width);
      const nextY = clampTo(transform.y + velocity.y * dt, height);

      // Já está DENTRO de uma pedra? Então pode sair andando.
      //
      // Sem esta saída, quem nascesse debaixo de uma pedra — ou levasse uma
      // pedra em cima, que é o que o jogador vai fazer — ficava congelado para
      // sempre: todo destino era bloqueado, e a criatura morria de fome parada.
      // Continua sem poder entrar no lago, que é o único obstáculo de verdade
      // intransponível.
      if (solids.blocked(terrain, transform.x, transform.y)) {
        if (!isWaterAt(terrain, nextX, nextY)) {
          transform.x = nextX;
          transform.y = nextY;
        }
        return;
      }

      const mind = minds.get(entity);

      if (!solids.blocked(terrain, nextX, nextY)) {
        transform.x = nextX;
        transform.y = nextY;
        // DECAI em vez de zerar: numa margem recortada a criatura alterna
        // passo livre e passo barrado sem sair do lugar, e zerando o contador
        // ela nunca chegava a desistir — ficava presa na enseada até morrer.
        if (mind) mind.blocked = Math.max(0, mind.blocked - dt * 1.5);
        return;
      }

      // Bloqueada: desliza pelo eixo que ainda estiver livre.
      if (!solids.blocked(terrain, nextX, transform.y)) {
        transform.x = nextX;
      } else if (!solids.blocked(terrain, transform.x, nextY)) {
        transform.y = nextY;
      }
      if (mind) mind.blocked += dt;
    });
  },
};

const clampTo = (value: number, max: number): number =>
  value < 2 ? 2 : value > max - 2 ? max - 2 : value;
