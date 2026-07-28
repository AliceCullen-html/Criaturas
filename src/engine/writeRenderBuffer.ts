import { Sprite, Transform } from './components';
import type { RenderBuffer } from './renderBuffer';
import type { World } from './world';

/**
 * Projeta as entidades desenháveis (Transform + Sprite) no `RenderBuffer`
 * somente-leitura. Reutiliza o buffer — sem alocação por quadro.
 *
 * `Sprite` é o desenho SIMPLES: uma figura num ponto do chão, e nada mais. Quem
 * precisa de mais que isso — os objetos, que murcham, se escondem, se empilham
 * e (no caso da bola) saem do chão — tem o seu próprio escritor de buffer e não
 * carrega `Sprite`. Carregar os dois fazia cada objeto ser desenhado duas
 * vezes; sobrepostas, as cópias eram invisíveis, até a bola quicar e uma delas
 * subir sem a outra.
 */
export function writeRenderBuffer(world: World, buffer: RenderBuffer): void {
  const transforms = world.store(Transform);
  const sprites = world.store(Sprite);

  buffer.clear();
  sprites.forEach((sprite, entity) => {
    const transform = transforms.get(entity);
    if (!transform) return;
    buffer.push(
      transform.x,
      transform.y,
      transform.prevX,
      transform.prevY,
      sprite.radius,
      sprite.color,
      sprite.variant,
    );
  });
}
