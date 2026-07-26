import { Transform, type World } from '@engine';
import { BOULDER_RADIUS, Item, isWaterAt, type Terrain } from '@world';

/**
 * O que é sólido no jardim: a água do lago e as pedras grandes.
 *
 * Fica num módulo próprio porque dois sistemas precisam da mesma resposta — o
 * movimento (para não atravessar) e o confinamento (para saber se alguém foi
 * encurralado). Cada um reconstrói a lista quando vai usar; são poucas pedras,
 * e assim nenhum dos dois depende de rodar depois do outro.
 */

/** Onde a criatura encosta: raio da pedra mais um pouco de corpo. */
const BLOCK_RADIUS = BOULDER_RADIUS + 4;

export class Solids {
  private readonly x: number[] = [];
  private readonly y: number[] = [];

  rebuild(world: World): void {
    this.x.length = 0;
    this.y.length = 0;
    const transforms = world.store(Transform);
    world.store(Item).forEach((item, entity) => {
      // Na mão do jogador a pedra não bloqueia: ele está justamente carregando.
      if (item.kind !== 'boulder' || item.held) return;
      const transform = transforms.get(entity);
      if (!transform) return;
      this.x.push(transform.x);
      this.y.push(transform.y);
    });
  }

  get count(): number {
    return this.x.length;
  }

  blocked(terrain: Terrain, x: number, y: number): boolean {
    if (isWaterAt(terrain, x, y)) return true;
    const reach2 = BLOCK_RADIUS * BLOCK_RADIUS;
    for (let i = 0; i < this.x.length; i++) {
      const dx = this.x[i]! - x;
      const dy = this.y[i]! - y;
      if (dx * dx + dy * dy < reach2) return true;
    }
    return false;
  }
}

/** Instância compartilhada — o jardim é um só. */
export const solids = new Solids();
