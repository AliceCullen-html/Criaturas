import { clamp01 } from '@core';
import type { Intent } from '@creatures';
import type { Brain, Decision, Perception } from './brain';

/**
 * Cérebro por utilidade.
 *
 * Cada ação candidata calcula sua própria pontuação a partir de
 * necessidades × emoções × personalidade × memória. Vence a maior nota. Não há
 * script por criatura: dois indivíduos com genes e vivências diferentes
 * pontuam as mesmas opções de formas diferentes — e é daí que nasce a
 * personalidade observável.
 */

interface Option {
  intent: Intent;
  score: number;
  targetX: number;
  targetY: number;
  targetEntity: number;
  commitment: number;
}

const NO_TARGET = -1;

function option(
  intent: Intent,
  score: number,
  targetX = 0,
  targetY = 0,
  targetEntity = NO_TARGET,
  commitment = 1.5,
): Option {
  return { intent, score, targetX, targetY, targetEntity, commitment };
}

/** Urgência cresce mais rápido que linearmente perto do limite (curva de pressão). */
const urgency = (value: number): number => value * value;

export function createUtilityBrain(): Brain {
  return {
    name: 'utility',
    decide(perception: Perception): Decision {
      const { self } = perception;
      const { needs, emotions, personality: traits, attributes } = self;
      const options: Option[] = [];

      // ---- Dormir -------------------------------------------------------
      // Preguiçosas dormem mais cedo; sob medo, ninguém relaxa.
      options.push(
        option(
          'sleep',
          (urgency(emotions.sleepiness) * 1.3 + urgency(1 - needs.energy)) *
            (1.25 - traits.activity * 0.5) *
            (1 - emotions.fear * 0.8),
          self.x,
          self.y,
          NO_TARGET,
          4,
        ),
      );

      // ---- Fugir --------------------------------------------------------
      // Da criatura agressiva mais próxima, ou do jogador em quem não confia.
      let threat: { x: number; y: number; weight: number } | null = null;
      for (const other of perception.creatures) {
        const hostility = other.aggression * (1 - other.affinity) - other.affinity * 0.5;
        if (hostility <= 0.25) continue;
        const proximity = 1 - clamp01(other.distance / attributes.vision);
        const weight = hostility * proximity;
        if (!threat || weight > threat.weight) {
          threat = { x: other.x, y: other.y, weight };
        }
      }
      const playerFear = perception.player?.present
        ? clamp01(-self.memory.valenceOf('player')) * emotions.fear
        : 0;
      if (perception.player?.present && playerFear > 0.2) {
        const weight = playerFear;
        if (!threat || weight > threat.weight) {
          threat = { x: perception.player.x, y: perception.player.y, weight };
        }
      }
      if (threat) {
        const dx = self.x - threat.x;
        const dy = self.y - threat.y;
        const len = Math.hypot(dx, dy) || 1;
        options.push(
          option(
            'flee',
            threat.weight * (1.6 + emotions.fear) * (1.4 - traits.bravery),
            self.x + (dx / len) * 140,
            self.y + (dy / len) * 140,
            NO_TARGET,
            1.2,
          ),
        );
      }

      // ---- Beber --------------------------------------------------------
      if (perception.water) {
        options.push(
          option(
            'seekWater',
            urgency(needs.thirst) * 1.5,
            perception.water.x,
            perception.water.y,
            NO_TARGET,
            2.5,
          ),
        );
      }

      // ---- Comer --------------------------------------------------------
      // A opinião aprendida sobre cada tipo de comida entra direto na nota:
      // é assim que "aquilo me fez mal" vira "evito aquilo".
      let bestFood: { score: number; x: number; y: number; id: number } | null = null;
      for (const food of perception.food) {
        const proximity = 1 - clamp01(food.distance / attributes.vision);
        const appetite = urgency(needs.hunger);
        // Comida com má fama só é considerada em fome extrema.
        const opinionFactor =
          food.opinion < 0 ? 1 + food.opinion * (1.6 - needs.hunger) : 1 + food.opinion * 0.5;
        const score = appetite * (0.6 + proximity * 0.8) * opinionFactor;
        if (score > 0 && (!bestFood || score > bestFood.score)) {
          bestFood = { score, x: food.x, y: food.y, id: food.id };
        }
      }
      if (bestFood) {
        options.push(
          option('seekFood', bestFood.score * 1.4, bestFood.x, bestFood.y, bestFood.id, 2),
        );
      }

      // ---- Procurar o jogador -------------------------------------------
      if (perception.player?.present) {
        const bond = self.memory.valenceOf('player');
        if (bond > 0) {
          options.push(
            option(
              'approachPlayer',
              bond * (emotions.trust * 1.4 + emotions.loneliness * 0.6 + traits.sociability * 0.4),
              perception.player.x,
              perception.player.y,
              NO_TARGET,
              2,
            ),
          );
        }
      }

      // ---- Social: brincar, seguir, brigar, dividir ----------------------
      for (const other of perception.creatures) {
        const proximity = 1 - clamp01(other.distance / attributes.vision);
        const liking = other.affinity;

        // Brincar — brincalhonas e felizes procuram companhia.
        options.push(
          option(
            'play',
            (traits.playfulness * 0.9 + emotions.happiness * 0.4 + emotions.loneliness * 0.7) *
              proximity *
              (0.5 + liking) *
              (1 - emotions.fear) *
              (other.isBaby || self.isBaby ? 1.2 : 1),
            other.x,
            other.y,
            other.id,
            3,
          ),
        );

        // Conviver — sociáveis se aproximam de quem gostam.
        options.push(
          option(
            'socialize',
            (traits.sociability * 0.8 + emotions.loneliness) * proximity * (0.4 + liking) * 0.9,
            other.x,
            other.y,
            other.id,
            2.5,
          ),
        );

        // Brigar — agressividade + raiva + território, freado por gentileza.
        options.push(
          option(
            'attack',
            (traits.aggression * 1.1 + emotions.anger * 1.2 + traits.territoriality * 0.6) *
              proximity *
              (1 - liking * 1.3) *
              (1 - traits.kindness * 0.8) *
              (other.isBaby ? 0.15 : 1) *
              traits.bravery,
            other.x,
            other.y,
            other.id,
            1.5,
          ),
        );

        // Dividir comida — gentis ajudam quem está por perto.
        if (needs.hunger < 0.4) {
          options.push(
            option(
              'share',
              traits.kindness * (0.6 + liking) * proximity * 0.7,
              other.x,
              other.y,
              other.id,
              2,
            ),
          );
        }
      }

      // ---- Acasalar -----------------------------------------------------
      if (!self.isBaby && self.matingCooldown <= 0 && needs.hunger < 0.6 && needs.energy > 0.35) {
        for (const other of perception.creatures) {
          if (!other.fertile) continue;
          const proximity = 1 - clamp01(other.distance / attributes.vision);
          options.push(
            option(
              'mate',
              attributes.fertility * (0.7 + other.affinity) * proximity * emotions.happiness * 1.3,
              other.x,
              other.y,
              other.id,
              3,
            ),
          );
        }
      }

      // ---- Explorar -----------------------------------------------------
      // Base sempre presente: curiosas exploram longe, medrosas ficam perto e
      // fogem de regiões onde já sofreram.
      const explore = 0.25 + emotions.curiosity * traits.curiosity * 0.9 + traits.activity * 0.2;
      options.push(
        option(
          'wander',
          explore * (1 - perception.placeDanger * 0.7) * (1 - emotions.sleepiness * 0.5),
          0,
          0,
          NO_TARGET,
          3,
        ),
      );

      let best = options[0]!;
      for (let i = 1; i < options.length; i++) {
        if (options[i]!.score > best.score) best = options[i]!;
      }

      return {
        intent: best.intent,
        targetX: best.targetX,
        targetY: best.targetY,
        targetEntity: best.targetEntity,
        commitment: best.commitment,
      };
    },
  };
}
