import type { World } from './world';

/** Uma regra da simulação. Roda a cada passo lógico com o dt fixo. */
export interface System {
  readonly name: string;
  update(world: World, dt: number): void;
}

/** Executa os sistemas registrados na ordem de inserção. */
export class SystemScheduler {
  private readonly systems: System[] = [];

  add(system: System): this {
    this.systems.push(system);
    return this;
  }

  update(world: World, dt: number): void {
    for (const system of this.systems) {
      system.update(world, dt);
    }
  }
}
