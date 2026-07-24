import { Transform, Velocity, type System } from '@engine';

/**
 * Integra a posição a partir da velocidade e envolve nas bordas do mundo
 * (topologia toroidal). Ajusta também `prev*` no *wrap* para que a interpolação
 * do render não desenhe um salto de um lado ao outro.
 */
export const movementSystem: System = {
  name: 'movement',
  update(world, dt) {
    const transforms = world.store(Transform);
    const velocities = world.store(Velocity);
    const { width, height } = world.config;

    transforms.forEach((transform, entity) => {
      const velocity = velocities.get(entity);
      if (!velocity) return;

      transform.prevX = transform.x;
      transform.prevY = transform.y;
      transform.x += velocity.x * dt;
      transform.y += velocity.y * dt;

      if (transform.x < 0) {
        transform.x += width;
        transform.prevX += width;
      } else if (transform.x >= width) {
        transform.x -= width;
        transform.prevX -= width;
      }

      if (transform.y < 0) {
        transform.y += height;
        transform.prevY += height;
      } else if (transform.y >= height) {
        transform.y -= height;
        transform.prevY -= height;
      }
    });
  },
};
