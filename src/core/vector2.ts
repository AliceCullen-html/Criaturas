/** Vetor 2D. Operações puras; variantes "into" escrevem no alvo para evitar GC. */
export interface Vector2 {
  x: number;
  y: number;
}

export const createVector2 = (x = 0, y = 0): Vector2 => ({ x, y });

export const length = (v: Vector2): number => Math.hypot(v.x, v.y);

export const distance = (a: Vector2, b: Vector2): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Escreve `a + b` em `out` e o retorna. */
export const addInto = (out: Vector2, a: Vector2, b: Vector2): Vector2 => {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  return out;
};

/** Escreve `v * scalar` em `out` e o retorna. */
export const scaleInto = (out: Vector2, v: Vector2, scalar: number): Vector2 => {
  out.x = v.x * scalar;
  out.y = v.y * scalar;
  return out;
};

/** Normaliza `v` em `out` (vetor nulo permanece nulo). */
export const normalizeInto = (out: Vector2, v: Vector2): Vector2 => {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) {
    out.x = 0;
    out.y = 0;
  } else {
    out.x = v.x / len;
    out.y = v.y / len;
  }
  return out;
};
