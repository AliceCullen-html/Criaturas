import { Transform, Velocity, type System } from '@engine';
import { TerrainResource, isWaterAt } from '@world';

/**
 * Integra a posição a partir da velocidade, respeitando as margens do lago.
 *
 * A água é intransponível: ao esbarrar nela, a criatura tenta deslizar pelo
 * eixo livre em vez de travar de frente. É isso que faz elas contornarem a
 * margem naturalmente e beberem da beira, em vez de atravessarem o lago.
 */
export const movementSystem: System = {
  name: 'movement',
  update(world, dt) {
    const transforms = world.store(Transform);
    const velocities = world.store(Velocity);
    const terrain = world.getResource(TerrainResource);
    const { width, height } = world.config;

    transforms.forEach((transform, entity) => {
      const velocity = velocities.get(entity);
      if (!velocity) return;
      if (velocity.x === 0 && velocity.y === 0) {
        transform.prevX = transform.x;
        transform.prevY = transform.y;
        return;
      }

      transform.prevX = transform.x;
      transform.prevY = transform.y;

      const nextX = clampTo(transform.x + velocity.x * dt, width);
      const nextY = clampTo(transform.y + velocity.y * dt, height);

      if (!isWaterAt(terrain, nextX, nextY)) {
        transform.x = nextX;
        transform.y = nextY;
        return;
      }

      // Bloqueada: desliza pelo eixo que ainda estiver livre.
      if (!isWaterAt(terrain, nextX, transform.y)) {
        transform.x = nextX;
      } else if (!isWaterAt(terrain, transform.x, nextY)) {
        transform.y = nextY;
      }
    });
  },
};

const clampTo = (value: number, max: number): number =>
  value < 2 ? 2 : value > max - 2 ? max - 2 : value;
