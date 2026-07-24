export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const TAU = Math.PI * 2;

/** Aproxima `value` de `target` a uma taxa por segundo (suavização temporal). */
export const approach = (value: number, target: number, rate: number, dt: number): number => {
  const delta = target - value;
  const step = rate * dt;
  return Math.abs(delta) <= step ? target : value + Math.sign(delta) * step;
};

/** HSL (0..1) para RGB empacotado em 0xRRGGBB. */
export function hslToRgb(h: number, s: number, l: number): number {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) [r, g, b] = [c, x, 0];
  else if (sector === 1) [r, g, b] = [x, c, 0];
  else if (sector === 2) [r, g, b] = [0, c, x];
  else if (sector === 3) [r, g, b] = [0, x, c];
  else if (sector === 4) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to255 = (v: number): number => Math.round(clamp01(v + m) * 255);
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}
