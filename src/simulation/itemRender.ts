import { RenderBuffer, Transform, type World } from '@engine';
import { Ball, Item, STACK_STEP, ballVariant, itemRadius } from '@world';

/** Bit de "escondido" acima do byte de frescor, no campo `color` do buffer. */
export const HIDDEN_FLAG = 256;

/** Projeta os objetos físicos (frutas, brinquedos) para o renderer. */
export function writeItemBuffer(world: World, buffer: RenderBuffer): void {
  const transforms = world.store(Transform);
  const balls = world.hasComponent(Ball) ? world.store(Ball) : null;
  buffer.clear();
  world.store(Item).forEach((item, entity) => {
    const transform = transforms.get(entity);
    if (!transform) return;
    // Empilhado, o objeto é desenhado acima do que está embaixo dele. O deslocamento
    // vale também para o hit-test: pegar a pilha pega a peça de cima.
    //
    // A bola acrescenta a esse mesmo deslocamento a ALTURA do quique: ela é a
    // única coisa do jardim que sai do chão, e é subindo na tela que o pulo
    // aparece. O ponto do mundo continua onde está — quem procura a bola a
    // encontra no chão mesmo enquanto ela voa.
    //
    // A altura sai dos DOIS eixos do mundo, e não só do y. Na projeção
    // isométrica a tela é `x − y` na horizontal e `(x + y)/2` na vertical:
    // tirar a altura só do y empurrava a bola na diagonal, subindo pela metade
    // e escorregando para a direita. Tirando dos dois, o x da tela não muda e
    // ela sobe reto, que é como uma coisa que quica se mexe.
    const ball = balls?.get(entity);
    const stack = item.stack * STACK_STEP;
    const lift = stack + (ball?.z ?? 0);
    const prevLift = stack + (ball?.prevZ ?? 0);
    // Frutas passadas ficam menores e mais opacas — o "color" carrega o frescor,
    // e o bit acima dele diz se o objeto está escondido.
    buffer.push(
      transform.x - lift,
      transform.y - lift,
      transform.prevX - prevLift,
      transform.prevY - prevLift,
      itemRadius(item),
      Math.round(item.freshness * 255) | (item.hidden ? HIDDEN_FLAG : 0),
      ball ? ballVariant(ball, Math.hypot(item.vx, item.vy)) : item.variant,
    );
  });
}
