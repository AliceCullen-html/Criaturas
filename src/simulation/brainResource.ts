import { defineResource } from '@engine';
import type { Brain } from '@ai';

/**
 * O cérebro usado pelas criaturas. Fica como recurso do mundo para que trocar
 * a implementação (utilidade → GOAP → rede neural) seja uma linha no
 * composition root, sem tocar em nenhum sistema.
 */
export const BrainResource = defineResource<Brain>('Brain');
