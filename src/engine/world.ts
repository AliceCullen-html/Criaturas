import type { Rng } from '@core';
import { ComponentStore } from './componentStore';
import type { ComponentType } from './component';
import { EntityManager, type Entity } from './entity';

export interface WorldConfig {
  readonly width: number;
  readonly height: number;
}

/**
 * Raiz do estado da simulação — vive fora do React. Reúne o gerenciador de
 * entidades, os `ComponentStore`s, o RNG semeado e a configuração do mundo.
 */
export class World {
  readonly entities = new EntityManager();
  readonly rng: Rng;
  readonly config: WorldConfig;
  tick = 0;

  private readonly stores = new Map<string, ComponentStore<unknown>>();

  constructor(config: WorldConfig, rng: Rng) {
    this.config = config;
    this.rng = rng;
  }

  register<T>(type: ComponentType<T>): ComponentStore<T> {
    let store = this.stores.get(type.name);
    if (!store) {
      store = new ComponentStore<T>() as ComponentStore<unknown>;
      this.stores.set(type.name, store);
    }
    return store as ComponentStore<T>;
  }

  store<T>(type: ComponentType<T>): ComponentStore<T> {
    const store = this.stores.get(type.name);
    if (!store) {
      throw new Error(`Componente não registrado: ${type.name}`);
    }
    return store as ComponentStore<T>;
  }

  createEntity(): Entity {
    return this.entities.create();
  }

  destroyEntity(entity: Entity): void {
    for (const store of this.stores.values()) {
      store.remove(entity);
    }
    this.entities.destroy(entity);
  }
}
