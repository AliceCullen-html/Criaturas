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
      //
      // E dorme EM CASA. Antes o alvo do sono era a própria posição — ela caía
      // no sono onde estivesse, e o jardim virava um monte de bichos dormindo
      // espalhados ao acaso. Agora o alvo é o ninho, quando ela já tem apego a
      // um: é essa linha que faz a família dormir junta, porque os ninhos das
      // amigas se aproximam sozinhos.
      const home = perception.home;
      const bed = home && home.attachment > 0.15 ? home : null;
      options.push(
        option(
          'sleep',
          (urgency(emotions.sleepiness) * 1.3 + urgency(1 - needs.energy)) *
            (1.25 - traits.activity * 0.5) *
            (1 - emotions.fear * 0.8),
          bed ? bed.x : self.x,
          bed ? bed.y : self.y,
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
            // O peso do medo é de QUEM FOGE. Com um termo constante alto, uma
            // criatura destemida fugia para sempre de qualquer vizinho de
            // temperamento forte — e nunca mais socializava nem acasalava.
            threat.weight * (0.35 + emotions.fear * 1.6) * (1.4 - traits.bravery),
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

      // ---- A mão do jogador ---------------------------------------------
      // Quem confia se aproxima; filhotes e brincalhonas perseguem a mão como
      // se fosse um brinquedo; quem teme já está coberto pela opção de fugir.
      if (perception.player?.present) {
        const bond = self.memory.valenceOf('player');
        const noticing = perception.attention > 0 ? 1.6 : 1;
        if (bond > 0) {
          options.push(
            option(
              'approachPlayer',
              bond *
                (emotions.trust * 1.4 + emotions.loneliness * 0.6 + traits.sociability * 0.4) *
                noticing,
              perception.player.x,
              perception.player.y,
              NO_TARGET,
              2,
            ),
          );
        }
        if (bond > -0.1) {
          options.push(
            option(
              'play',
              (traits.playfulness * 0.8 + (self.isBaby ? 0.7 : 0.15)) *
                emotions.curiosity *
                noticing *
                (1 - emotions.fear) *
                0.9,
              perception.player.x,
              perception.player.y,
              NO_TARGET,
              1.8,
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
              // Multiplicar tudo junto (afinidade × proximidade × felicidade)
              // zerava a vontade de acasalar: ninguém nunca escolhia, e a
              // população só envelhecia até acabar. Cada fator agora modula,
              // nenhum anula — bem alimentada, feliz e perto de alguém fértil,
              // a criatura quer mesmo é ter filhote.
              attributes.fertility *
                (0.55 + other.affinity * 0.6) *
                (0.4 + proximity * 0.8) *
                (0.5 + emotions.happiness * 0.8) *
                4.2,
              other.x,
              other.y,
              other.id,
              3,
            ),
          );
        }
      }

      // ---- Reagir ao tempo ----------------------------------------------
      if (perception.rain > 0.35) {
        // Chuva: as caseiras correm para debaixo da árvore...
        if (perception.shelter) {
          options.push(
            option(
              'shelter',
              perception.rain * (1.3 - traits.playfulness) * (1.2 - traits.bravery * 0.5),
              perception.shelter.x,
              perception.shelter.y,
              NO_TARGET,
              6,
            ),
          );
        }
        // ...e as brincalhonas ficam se divertindo no meio dela.
        options.push(
          option(
            'play',
            perception.rain * traits.playfulness * 1.2 * emotions.happiness,
            self.x,
            self.y,
            NO_TARGET,
            4,
          ),
        );
      } else if (needs.hunger < 0.5 && needs.thirst < 0.5 && emotions.fear < 0.2) {
        // Tempo bom e barriga cheia: hora de tomar sol sem fazer nada.
        options.push(
          option(
            'sunbathe',
            (0.5 + emotions.happiness * 0.6) * (1.2 - traits.activity) * 0.75,
            self.x,
            self.y,
            NO_TARGET,
            8,
          ),
        );
      }

      // ---- Investigar o que parece escondido ----------------------------
      // Ninguém "sabe" que há algo atrás da pedra. O que existe é curiosidade:
      // quem tem pouca passa direto, quem tem muita vai lá ver.
      if (perception.hunch) {
        const proximity = 1 - clamp01(perception.hunch.distance / attributes.vision);
        options.push(
          option(
            'search',
            (emotions.curiosity * 1.6 + traits.curiosity * 0.8) *
              // Curiosidade com endereço vence a vontade de vagar à toa — mas
              // só quem está curioso mesmo; saciada ou com medo, passa direto.
              (0.45 + proximity * 0.9) *
              (1 - emotions.fear) *
              (1 - needs.hunger * 0.5),
            perception.hunch.x,
            perception.hunch.y,
            NO_TARGET,
            4,
          ),
        );
      }

      // ---- Estudar ------------------------------------------------------
      //
      // Ninguém nasce querendo aprender: o que existe é uma máquina piscando e
      // uma criatura curiosa. E só quem está de barriga cheia, sem sede e sem
      // medo para de fazer o resto e fica olhando — aprender é o que sobra
      // quando não há nada urgente, e é por isso que ensinar depende de cuidar.
      if (perception.machine) {
        // O alcance da máquina é maior que a vista (ela acende), então a
        // proximidade se mede pela distância dela, não pela visão da criatura.
        const proximity = 1 - clamp01(perception.machine.distance / 300);
        options.push(
          option(
            'study',
            // Mesma forma da curiosidade que faz investigar o que parece
            // escondido — é a mesma pulsão. As necessidades apenas PODAM a
            // nota; multiplicá-las inteiras zerava a vontade de aprender em
            // qualquer criatura que não estivesse recém-saciada, e ninguém
            // nunca chegava à tela.
            (emotions.curiosity * 1.5 + traits.curiosity * 0.8 + (self.isBaby ? 0.5 : 0)) *
              (0.45 + proximity * 0.9) *
              (1 - emotions.fear) *
              (1 - needs.hunger * 0.85) *
              (1 - needs.thirst * 0.85) *
              (1 - emotions.sleepiness * 0.6) *
              0.95,
            perception.machine.x,
            perception.machine.y,
            NO_TARGET,
            // Compromisso longo: uma lição não cabe em dois segundos.
            7,
          ),
        );
      }

      // ---- Observar uma borboleta ---------------------------------------
      // Curiosas param para acompanhar o que passa voando.
      if (perception.ambient) {
        const proximity = 1 - clamp01(perception.ambient.distance / attributes.vision);
        options.push(
          option(
            'watch',
            (emotions.curiosity * 1.1 + traits.curiosity * 0.5 + (self.isBaby ? 0.5 : 0)) *
              proximity *
              (1 - emotions.fear) *
              (1 - perception.rain) *
              0.95,
            perception.ambient.x,
            perception.ambient.y,
            NO_TARGET,
            2.5,
          ),
        );
      }

      // ---- Filhote atrás de quem ele ama --------------------------------
      if (self.isBaby) {
        let guardian: (typeof perception.creatures)[number] | null = null;
        for (const other of perception.creatures) {
          if (other.isBaby || other.affinity <= 0.2) continue;
          if (!guardian || other.affinity > guardian.affinity) guardian = other;
        }
        if (guardian) {
          options.push(
            option(
              'follow',
              (0.8 + guardian.affinity) * (1 + emotions.fear) * 1.1,
              guardian.x,
              guardian.y,
              guardian.id,
              2,
            ),
          );
        }
      }

      // ---- Andar com a melhor amiga -------------------------------------
      //
      // Não é "socializar com quem estiver perto": é procurar UMA criatura
      // específica, a que ela mais gosta, e ficar por perto. É o que faz duas
      // delas aparecerem juntas de novo e de novo, que é como o jogador
      // percebe que existe uma amizade ali.
      const friend = perception.friend;
      if (friend && friend.distance > 26) {
        options.push(
          option(
            'follow',
            (0.35 + friend.strength * 1.15) *
              (0.5 + emotions.loneliness * 0.9) *
              traits.sociability *
              (1 - emotions.fear * 0.7),
            friend.x,
            friend.y,
            friend.id,
            3,
          ),
        );
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
