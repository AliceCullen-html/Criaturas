import { defineResource } from '@engine';
import type { Terrain } from './terrain';

/** Chave para guardar/recuperar o terreno no `World`. */
export const TerrainResource = defineResource<Terrain>('Terrain');
