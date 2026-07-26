import type { PersonalityTraits } from './express';

/**
 * Espécies. Cada uma tem silhueta própria (definida no renderer, pelo índice)
 * e um temperamento característico — que é só um *viés*: dentro da mesma
 * espécie, os indivíduos continuam variando pelos genes.
 */
export interface Species {
  readonly index: number;
  readonly name: string;
  /** Empurrão nos traços, somado ao genoma e depois normalizado. */
  readonly bias: Partial<PersonalityTraits>;
  /** Matiz preferida (0..1) e quanto a espécie se prende a ela. */
  readonly hue: number;
  readonly hueSpread: number;
}

export const SPECIES: readonly Species[] = [
  {
    index: 0,
    name: 'Peludinho',
    bias: { kindness: 0.25, sociability: 0.25, aggression: -0.2 },
    hue: 0.08,
    hueSpread: 0.1,
  },
  {
    index: 1,
    name: 'Gordinho',
    bias: { activity: -0.3, kindness: 0.2, playfulness: 0.1 },
    hue: 0.12,
    hueSpread: 0.14,
  },
  {
    index: 2,
    name: 'Orelhudo',
    bias: { curiosity: 0.3, bravery: -0.25 },
    hue: 0.75,
    hueSpread: 0.12,
  },
  {
    index: 3,
    name: 'Rabudo',
    bias: { playfulness: 0.35, activity: 0.25 },
    hue: 0.55,
    hueSpread: 0.12,
  },
  {
    index: 4,
    name: 'Anteninha',
    bias: { curiosity: 0.35, bravery: 0.15, sociability: -0.1 },
    hue: 0.42,
    hueSpread: 0.1,
  },
  {
    index: 5,
    name: 'Folhinha',
    bias: { kindness: 0.3, aggression: -0.3, activity: -0.1 },
    hue: 0.3,
    hueSpread: 0.08,
  },
  {
    index: 6,
    name: 'Aquático',
    bias: { bravery: 0.25, curiosity: 0.2 },
    hue: 0.52,
    hueSpread: 0.08,
  },
  {
    index: 7,
    name: 'Noturno',
    bias: { territoriality: 0.3, sociability: -0.3, aggression: 0.15 },
    hue: 0.72,
    hueSpread: 0.14,
  },
];

export const SPECIES_COUNT = SPECIES.length;

export const speciesAt = (index: number): Species =>
  SPECIES[((index % SPECIES_COUNT) + SPECIES_COUNT) % SPECIES_COUNT]!;
