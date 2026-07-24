import { defineResource } from '@engine';

/**
 * Presença do jogador no mundo (a posição do cursor). As criaturas percebem
 * essa presença: quem confia se aproxima, quem teme foge.
 */
export interface PlayerPresence {
  x: number;
  y: number;
  present: boolean;
}

export const PlayerResource = defineResource<PlayerPresence>('Player');
