import { describe, it, expect } from 'vitest';
import { createRng } from '@core';
import { ComponentStore } from './componentStore';
import { EntityManager } from './entity';
import { defineComponent } from './component';
import { World } from './world';

describe('ComponentStore', () => {
  it('mantém consistência após swap-remove', () => {
    const store = new ComponentStore<number>();
    store.set(1, 10);
    store.set(2, 20);
    store.set(3, 30);
    expect(store.size).toBe(3);

    store.remove(2);
    expect(store.has(2)).toBe(false);
    expect(store.get(1)).toBe(10);
    expect(store.get(3)).toBe(30);
    expect(store.size).toBe(2);
  });

  it('sobrescreve sem duplicar', () => {
    const store = new ComponentStore<string>();
    store.set(5, 'a');
    store.set(5, 'b');
    expect(store.get(5)).toBe('b');
    expect(store.size).toBe(1);
  });
});

describe('EntityManager', () => {
  it('recicla ids destruídos e mantém a contagem', () => {
    const manager = new EntityManager();
    const a = manager.create();
    manager.create();
    expect(manager.count).toBe(2);

    manager.destroy(a);
    expect(manager.count).toBe(1);

    const recycled = manager.create();
    expect(recycled).toBe(a);
    expect(manager.count).toBe(2);
  });
});

describe('World', () => {
  it('remove todos os componentes ao destruir a entidade', () => {
    const Health = defineComponent<number>('Health');
    const world = new World({ width: 100, height: 100 }, createRng(1));
    world.register(Health);

    const entity = world.createEntity();
    world.store(Health).set(entity, 5);
    expect(world.store(Health).has(entity)).toBe(true);

    world.destroyEntity(entity);
    expect(world.store(Health).has(entity)).toBe(false);
  });
});
