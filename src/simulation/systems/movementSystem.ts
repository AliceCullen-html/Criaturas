import type { System } from '@engine';
import { Position, Velocity } from '../components';

/**
 * Integra a posição a partir da velocidade e envolve nas bordas do mundo
 * (topologia toroidal). Ajusta também `prev*` no *wrap* para que a interpolação
 * do render não desenhe um salto de um lado ao outro.
 */
export const movementSystem: System = {
  name: 'movement',
  update(world, dt) {
    const positions = world.store(Position);
    const velocities = world.store(Velocity);
    const { width, height } = world.config;

    positions.forEach((position, entity) => {
      const velocity = velocities.get(entity);
      if (!velocity) return;

      position.prevX = position.x;
      position.prevY = position.y;
      position.x += velocity.x * dt;
      position.y += velocity.y * dt;

      if (position.x < 0) {
        position.x += width;
        position.prevX += width;
      } else if (position.x >= width) {
        position.x -= width;
        position.prevX -= width;
      }

      if (position.y < 0) {
        position.y += height;
        position.prevY += height;
      } else if (position.y >= height) {
        position.y -= height;
        position.prevY -= height;
      }
    });
  },
};
