import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('é determinístico para a mesma seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produz valores em [0, 1)', () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('getState/setState restaura a sequência', () => {
    const rng = createRng(7);
    rng.next();
    rng.next();
    const saved = rng.getState();
    const expected = [rng.next(), rng.next()];
    rng.setState(saved);
    expect([rng.next(), rng.next()]).toEqual(expected);
  });

  it('pick lança erro em array vazio', () => {
    const rng = createRng(1);
    expect(() => rng.pick([])).toThrow();
  });
});
