/** Identificador de uma entidade. É apenas um número (índice reciclável). */
export type Entity = number;

/**
 * Cria e destrói entidades, reciclando ids liberados para manter os números
 * baixos e densos (bom para os arrays esparsos dos `ComponentStore`).
 */
export class EntityManager {
  private next: Entity = 0;
  private liveCount = 0;
  private readonly freeList: Entity[] = [];
  private readonly alive: boolean[] = [];

  create(): Entity {
    const recycled = this.freeList.pop();
    const entity = recycled ?? this.next++;
    this.alive[entity] = true;
    this.liveCount += 1;
    return entity;
  }

  destroy(entity: Entity): boolean {
    if (this.alive[entity] !== true) return false;
    this.alive[entity] = false;
    this.freeList.push(entity);
    this.liveCount -= 1;
    return true;
  }

  isAlive(entity: Entity): boolean {
    return this.alive[entity] === true;
  }

  get count(): number {
    return this.liveCount;
  }
}
