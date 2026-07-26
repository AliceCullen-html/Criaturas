/**
 * Aparência das espécies. O renderer é dono da silhueta; a genética é dona do
 * temperamento. As duas se ligam apenas pelo índice — nenhuma delas precisa
 * conhecer a outra.
 */
export interface SpeciesShape {
  readonly name: string;
  /** Multiplicadores sobre as proporções base. */
  readonly headScale: number;
  readonly bodyScale: number;
  /** Traços garantidos da espécie (silhueta reconhecível). */
  readonly ears: 0 | 1 | 2 | 3; // 0 = decidido pelo DNA
  readonly antennae: boolean;
  readonly horns: boolean;
  readonly bigTail: boolean;
  readonly fins: boolean;
  readonly leaf: boolean;
  readonly fluffy: boolean;
  /** Escurece a paleta (noturnos). */
  readonly darken: number;
}

export const SPECIES_SHAPES: readonly SpeciesShape[] = [
  // 0 Peludinho — silhueta felpuda e arredondada.
  {
    name: 'Peludinho',
    headScale: 1.02,
    bodyScale: 1,
    ears: 1,
    antennae: false,
    horns: false,
    bigTail: false,
    fins: false,
    leaf: false,
    fluffy: true,
    darken: 0,
  },
  // 1 Gordinho — bem largo, quase sem pescoço.
  {
    name: 'Gordinho',
    headScale: 0.88,
    bodyScale: 1.75,
    ears: 1,
    antennae: false,
    horns: false,
    bigTail: false,
    fins: false,
    leaf: false,
    fluffy: false,
    darken: 0,
  },
  // 2 Orelhudo — orelhas enormes e caídas.
  {
    name: 'Orelhudo',
    headScale: 1.0,
    bodyScale: 0.82,
    ears: 3,
    antennae: false,
    horns: false,
    bigTail: false,
    fins: false,
    leaf: false,
    fluffy: false,
    darken: 0,
  },
  // 3 Rabudo — cauda maior que o corpo.
  {
    name: 'Rabudo',
    headScale: 0.98,
    bodyScale: 0.85,
    ears: 2,
    antennae: false,
    horns: false,
    bigTail: true,
    fins: false,
    leaf: false,
    fluffy: false,
    darken: 0,
  },
  // 4 Anteninha — antenas com bolinhas luminosas.
  {
    name: 'Anteninha',
    headScale: 1.02,
    bodyScale: 0.88,
    ears: 0,
    antennae: true,
    horns: false,
    bigTail: false,
    fins: false,
    leaf: false,
    fluffy: false,
    darken: 0,
  },
  // 5 Folhinha — folha brotando na cabeça.
  {
    name: 'Folhinha',
    headScale: 1,
    bodyScale: 0.95,
    ears: 0,
    antennae: false,
    horns: false,
    bigTail: false,
    fins: false,
    leaf: true,
    fluffy: false,
    darken: 0,
  },
  // 6 Aquático — nadadeiras laterais e cauda chata.
  {
    name: 'Aquático',
    headScale: 1,
    bodyScale: 1.05,
    ears: 0,
    antennae: false,
    horns: false,
    bigTail: false,
    fins: true,
    leaf: false,
    fluffy: false,
    darken: 0,
  },
  // 7 Noturno — chifrinhos e cores profundas.
  {
    name: 'Noturno',
    headScale: 0.98,
    bodyScale: 0.95,
    ears: 2,
    antennae: false,
    horns: true,
    bigTail: false,
    fins: false,
    leaf: false,
    fluffy: false,
    darken: 0.28,
  },
];

export const shapeAt = (index: number): SpeciesShape =>
  SPECIES_SHAPES[
    ((index % SPECIES_SHAPES.length) + SPECIES_SHAPES.length) % SPECIES_SHAPES.length
  ]!;
