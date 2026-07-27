/**
 * A paleta do Tintim.
 *
 * Mora em `@core` pelo mesmo motivo que as poses e a grade: é um vocabulário
 * que DOIS lados precisam ler igual e que nenhum dos dois pode importar do
 * outro. A genética decide a cor da criatura ao expressar o genoma; o renderer
 * decide a cor de cada pedaço ao desenhá-la. Se cada um tivesse a sua cópia,
 * bastaria mexer num para o macacão sair de um tom e o sapato de outro.
 *
 * As cores são do ZX Spectrum — chapadas e berrantes, sem meio-tom. Essa
 * escolha é do desenho original e é o que dá a ele a cara que tem.
 */
export const TINTIM = {
  /** Cabeça e braços. */
  body: 0xf7e12a,
  /** O macacão. */
  overall: 0xe32b22,
  /** Bolinhas das antenas e pernas — acendem, é o brilho da criatura. */
  bulb: 0x2fe3f2,
  /** Alças, peitilho e sapatos. */
  trim: 0xf03ad0,
  /** Pupila, dentro do olho branco. */
  pupil: 0xd21c1c,
} as const;
