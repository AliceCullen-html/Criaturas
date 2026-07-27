import { TINTIM, clamp01, lerp } from '@core';
import { GENE, type Genome } from './genome';
import { SPECIES_COUNT, speciesAt, type Species } from './species';

/** Traços de personalidade, todos 0..1. Influenciam a pontuação das decisões. */
export interface PersonalityTraits {
  curiosity: number;
  bravery: number;
  aggression: number;
  kindness: number;
  sociability: number;
  activity: number;
  territoriality: number;
  playfulness: number;
}

/** Resultado da expressão do genoma: o que a criatura "é" fisicamente e de temperamento. */
export interface Phenotype {
  speed: number;
  vision: number;
  strength: number;
  fertility: number;
  size: number;
  metabolism: number;
  lifespan: number;
  bodyColor: number;
  /** Cor secundária: barriga, manchas e detalhes. */
  accentColor: number;
  eyeColor: number;
  features: number;
  species: Species;
  personality: PersonalityTraits;
}

const gene = (genome: Genome, index: number): number => genome[index] ?? 0.5;

/** Mapeamento genótipo → fenótipo. Único ponto que conhece as faixas dos atributos. */
export function express(genome: Genome): Phenotype {
  const size = lerp(8, 15, gene(genome, GENE.size));
  const species = speciesAt(Math.floor(gene(genome, GENE.species) * SPECIES_COUNT));

  // Traços = genes + viés da espécie. O viés inclina, mas não determina:
  // ainda existem Noturnos gentis e Folhinhas ariscas.
  const trait = (key: keyof PersonalityTraits, geneIndex: number): number =>
    clamp01(gene(genome, geneIndex) + (species.bias[key] ?? 0));

  const aggression = trait('aggression', GENE.aggression);

  return {
    speed: lerp(20, 52, gene(genome, GENE.speed)) * lerp(1.1, 0.85, gene(genome, GENE.size)),
    vision: lerp(70, 175, gene(genome, GENE.vision)),
    strength: lerp(0.15, 0.9, (aggression + gene(genome, GENE.size)) / 2),
    fertility: lerp(0.2, 1, gene(genome, GENE.fertility)),
    size,
    metabolism: lerp(0.7, 1.4, gene(genome, GENE.metabolism)),
    lifespan: lerp(900, 1800, gene(genome, GENE.longevity)),
    // AS CORES DO TINTIM.
    //
    // Fixas, e é uma escolha, não um descuido: o pedido era esta criatura, não
    // uma família parecida com ela. O amarelo, o macacão vermelho, as antenas
    // cianas e as pupilas vermelhas são a identidade dela, e uma população em
    // que cada um tem um tom é uma população de outra coisa.
    //
    // Os genes de cor continuam existindo e continuam sendo herdados e
    // mutados — `hue`, `accent` e `eyeHue` estão logo ali. Voltar a pintar por
    // genoma é trocar estas três linhas pelas de antes, sem tocar em mais nada.
    bodyColor: TINTIM.body,
    accentColor: TINTIM.overall,
    eyeColor: TINTIM.pupil,
    features: Math.floor(gene(genome, GENE.features) * 0xffffff),
    species,
    personality: {
      curiosity: trait('curiosity', GENE.curiosity),
      bravery: trait('bravery', GENE.bravery),
      aggression,
      kindness: trait('kindness', GENE.kindness),
      sociability: trait('sociability', GENE.sociability),
      activity: trait('activity', GENE.activity),
      territoriality: trait('territoriality', GENE.territoriality),
      playfulness: trait('playfulness', GENE.playfulness),
    },
  };
}

interface TraitLabel {
  readonly key: keyof PersonalityTraits;
  readonly high: string;
  readonly low: string;
}

const TRAIT_LABELS: readonly TraitLabel[] = [
  { key: 'curiosity', high: 'Curiosa', low: 'Cautelosa' },
  { key: 'bravery', high: 'Corajosa', low: 'Medrosa' },
  { key: 'aggression', high: 'Agressiva', low: 'Pacífica' },
  { key: 'kindness', high: 'Gentil', low: 'Egoísta' },
  { key: 'sociability', high: 'Sociável', low: 'Solitária' },
  { key: 'activity', high: 'Enérgica', low: 'Preguiçosa' },
  { key: 'territoriality', high: 'Territorial', low: 'Tranquila' },
  { key: 'playfulness', high: 'Brincalhona', low: 'Séria' },
];

/**
 * Rótulos dos traços mais marcantes (os mais distantes da média), para a UI.
 * É descrição, não comportamento — o comportamento vem da pontuação das ações.
 */
export function describePersonality(traits: PersonalityTraits, max = 3): string[] {
  return TRAIT_LABELS.map((label) => {
    const value = traits[label.key];
    return { label, distance: Math.abs(value - 0.5), value };
  })
    .sort((a, b) => b.distance - a.distance)
    .slice(0, max)
    .filter((entry) => entry.distance > 0.12)
    .map((entry) => {
      const name = entry.value >= 0.5 ? entry.label.high : entry.label.low;
      return entry.distance > 0.35 ? `Muito ${name.toLowerCase()}` : name;
    });
}
