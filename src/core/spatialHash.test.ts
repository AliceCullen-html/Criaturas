import { describe, it, expect } from 'vitest';
import { SpatialHash } from './spatialHash';

describe('SpatialHash', () => {
  it('encontra pontos dentro do raio de consulta', () => {
    const hash = new SpatialHash(10, 100, 100);
    hash.insert(1, 5, 5);
    hash.insert(2, 12, 8);
    hash.insert(3, 90, 90);

    const out: number[] = [];
    hash.query(6, 6, 10, out);

    expect(out).toContain(1);
    expect(out).toContain(2);
    expect(out).not.toContain(3);
  });

  it('clear esvazia o índice', () => {
    const hash = new SpatialHash(10, 100, 100);
    hash.insert(1, 5, 5);
    hash.clear();

    const out: number[] = [];
    hash.query(5, 5, 10, out);
    expect(out).toHaveLength(0);
  });

  it('não confunde bordas opostas (sem colisão de chave)', () => {
    const hash = new SpatialHash(10, 100, 100);
    hash.insert(1, 99, 0); // canto direito, linha 0
    hash.insert(2, 0, 15); // coluna 0, linha 1

    const out: number[] = [];
    hash.query(99, 0, 5, out);
    expect(out).toContain(1);
    expect(out).not.toContain(2);
  });
});
