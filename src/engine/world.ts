import type { Rng } from '@core';
import { ComponentStore } from './componentStore';
import type { ComponentType } from './component';
import { EntityManager, type Entity } from './entity';
import type { ResourceKey } from './resource';

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
  private readonly resources = new Map<string, unknown>();

  constructor(config: WorldConfig, rng: Rng) {
    this.config = config;
    this.rng = rng;
  }

  setResource<T>(key: ResourceKey<T>, value: T): void {
    this.resources.set(key.name, value);
  }

  getResource<T>(key: ResourceKey<T>): T {
    const value = this.resources.get(key.name);
    if (value === undefined) {
      throw new Error(`Recurso não encontrado: ${key.name}`);
    }
    return value as T;
  }

  hasResource<T>(key: ResourceKey<T>): boolean {
    return this.resources.has(key.name);
  }

  register<T>(type: ComponentType<T>): ComponentStore<T> {
    let store = this.stores.get(type.name);
    if (!store) {
      store = new ComponentStore<T>() as ComponentStore<unknown>;
      this.stores.set(type.name, store);
    }
    return store as ComponentStore<T>;
  }

  /**
   * O componente chegou a ser registrado neste mundo?
   *
   * Um mundo recém-gerado tem terreno, plantas e cenário, mas ainda não tem
   * criaturas — elas entram depois, com `spawnCreatures`. Comandos que só
   * querem AVISAR as criaturas (uma pedra caindo, uma muda nascendo) precisam
   * poder perguntar antes, em vez de estourar num mundo legítimo.
   */
  hasComponent<T>(type: ComponentType<T>): boolean {
    return this.stores.has(type.name);
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
