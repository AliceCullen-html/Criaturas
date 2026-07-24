import type { Entity } from './entity';

/**
 * Armazenamento de um componente no estilo *sparse set*.
 *
 * Os dados ficam num array denso (iteração cache-friendly, sem buracos),
 * enquanto um mapa esparso liga cada entidade ao seu índice denso. Add, get e
 * remove são O(1); a remoção usa *swap-remove* para manter a densidade.
 */
export class ComponentStore<T> {
  private readonly dense: T[] = [];
  private readonly denseEntities: Entity[] = [];
  private readonly sparse = new Map<Entity, number>();

  has(entity: Entity): boolean {
    return this.sparse.has(entity);
  }

  get(entity: Entity): T | undefined {
    const index = this.sparse.get(entity);
    return index === undefined ? undefined : this.dense[index];
  }

  /** Adiciona ou sobrescreve o componente da entidade. */
  set(entity: Entity, value: T): void {
    const index = this.sparse.get(entity);
    if (index !== undefined) {
      this.dense[index] = value;
      return;
    }
    this.sparse.set(entity, this.dense.length);
    this.dense.push(value);
    this.denseEntities.push(entity);
  }

  remove(entity: Entity): boolean {
    const index = this.sparse.get(entity);
    if (index === undefined) return false;

    const lastIndex = this.dense.length - 1;
    const lastEntity = this.denseEntities[lastIndex]!;
    this.dense[index] = this.dense[lastIndex]!;
    this.denseEntities[index] = lastEntity;
    this.sparse.set(lastEntity, index);

    this.dense.pop();
    this.denseEntities.pop();
    this.sparse.delete(entity);
    return true;
  }

  get size(): number {
    return this.dense.length;
  }

  /** Itera os componentes em ordem densa (estável na ausência de remoções). */
  forEach(callback: (value: T, entity: Entity) => void): void {
    for (let i = 0; i < this.dense.length; i++) {
      callback(this.dense[i]!, this.denseEntities[i]!);
    }
  }
}
