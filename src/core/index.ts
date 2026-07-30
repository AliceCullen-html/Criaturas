// Kernel puro do projeto — sem dependências de framework nem do navegador.
// Regra: este módulo NÃO importa de nenhum outro módulo de `src/`.

export { createRng } from './rng';
export type { Rng } from './rng';
export * from './vector2';
export * from './math';
export { SpatialHash } from './spatialHash';
export { CreatureMemory, subjects, placeSpot, PLACE_CELL } from './memory';
export {
  TILE,
  tileColOf,
  tileRowOf,
  tileCenterX,
  tileCenterY,
  tileCols,
  tileRows,
  tileIndex,
} from './grid';
export { TINTIM } from './tintim';
export { EGG_CRACK_AT } from './egg';
export { TOOL, TOOL_COUNT, TOOL_NAMES, TOOL_HINTS, ICON, ICON_COUNT } from './tools';
export type { ToolId } from './tools';
export { Lexicon, WORD, WORD_TEXT, WORD_COUNT, KNOWN } from './language';
export type { WordId } from './language';
export { FORCED_POSES, POSE, POSE_COUNT, POSE_DURATION, POSE_NAMES } from './poses';
export type { PoseId } from './poses';
export {
  INTENT,
  INTENT_NAMES,
  INTENT_COUNT,
  MOOD,
  MOOD_NAMES,
  MOOD_COUNT,
  COMPANY,
  COMPANY_COUNT,
} from './minds';
export type { Intent, Mood } from './minds';
export type { MemorySubject, MemoryTrace, Episode, EpisodeInput } from './memory';
