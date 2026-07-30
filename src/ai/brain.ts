import type { CreatureMemory } from '@core';
import type { Attributes, Emotions, Intent, Needs } from '@creatures';
import type { PersonalityTraits } from '@genetics';

/** Uma criatura vizinha, como percebida por quem decide. */
export interface PerceivedCreature {
  id: number;
  x: number;
  y: number;
  distance: number;
  size: number;
  aggression: number;
  isBaby: boolean;
  affinity: number;
  sex: 'M' | 'F' | 'none';
  fertile: boolean;
}

/** Uma fonte de comida percebida. */
export interface PerceivedFood {
  id: number;
  x: number;
  y: number;
  distance: number;
  variant: number;
  /** Opinião aprendida sobre esse tipo de comida (-1 péssima … +1 ótima). */
  opinion: number;
}

/** Tudo que a criatura sabe no instante da decisão. */
export interface Perception {
  self: {
    id: number;
    x: number;
    y: number;
    age: number;
    isBaby: boolean;
    needs: Needs;
    emotions: Emotions;
    personality: PersonalityTraits;
    attributes: Attributes;
    memory: CreatureMemory;
    matingCooldown: number;
  };
  creatures: PerceivedCreature[];
  food: PerceivedFood[];
  water: { x: number; y: number } | null;
  player: { x: number; y: number; present: boolean } | null;
  placeDanger: number;
  /** Segundos restantes de atenção voltada à mão do jogador. */
  attention: number;
  /** Bichinho de ambiente mais próximo (borboleta, abelha...), se houver. */
  ambient: { x: number; y: number; distance: number } | null;
  /** Abrigo mais próximo (árvore), para se proteger da chuva. */
  shelter: { x: number; y: number; distance: number } | null;
  /**
   * Suspeita de que há algo ali. Não é "sei que tem uma fruta atrás da pedra":
   * é só um ponto que destoa. Quem investiga é quem está curioso.
   */
  hunch: { x: number; y: number; distance: number } | null;
  /** 0 = tempo bom, 1 = chovendo forte. */
  rain: number;
  /**
   * O ninho: o canto do jardim que ela chama de seu, e o quanto já é dela.
   * É para lá que ela volta para dormir — e é por isso que as famílias
   * acabam dormindo juntas, sem que nada mande "durmam em grupo".
   */
  home: { x: number; y: number; attachment: number } | null;
  /**
   * O computador, quando está à vista.
   *
   * A única coisa do jardim que não é natureza. Uma criatura não sabe o que ele
   * é — o que ela tem é curiosidade por uma luz que pisca, e é só disso que a
   * linguagem precisa para começar.
   */
  machine: { x: number; y: number; distance: number } | null;
  /**
   * A BOLA mais próxima, quando há uma no jardim.
   *
   * Separada da comida e dos objetos escondidos porque o que ela mobiliza é
   * outra coisa: não é fome nem suspeita, é vontade de brincar. Uma criatura
   * séria passa direto; uma brincalhona atravessa o jardim.
   */
  ball: { id: number; x: number; y: number; distance: number } | null;
  /** A melhor amiga e o maior desafeto, lidos da memória. */
  friend: { id: number; x: number; y: number; distance: number; strength: number } | null;
  rival: { id: number; strength: number } | null;
  /**
   * ESTÃO OLHANDO PARA DENTRO DESTA CABEÇA.
   *
   * Ligado só para a criatura que o jogador está observando no painel, e por um
   * motivo prático: a lista de opções pontuadas é a coisa mais interessante que
   * o cérebro produz e a que ele mais joga fora. Guardá-la para todo mundo, a
   * cada decisão, seria alocar centenas de listas por segundo para ninguém ler.
   */
  explain?: boolean;
}

/** Uma opção que o cérebro considerou, com a nota que ela tirou. */
export interface ScoredOption {
  intent: Intent;
  score: number;
}

/** O que a criatura decidiu fazer. */
export interface Decision {
  intent: Intent;
  targetX: number;
  targetY: number;
  targetEntity: number;
  /** Por quanto tempo manter a decisão antes de reavaliar (segundos). */
  commitment: number;
  /**
   * O que mais ela considerou, e quanto cada coisa valia — só quando pediram.
   *
   * É a resposta à pergunta que o painel faz: "por que ela fez isso, e o que
   * quase ganhou?". Sem isto, um cérebro por utilidade é uma caixa preta que
   * cospe uma intenção; com isto, dá para ver a decisão sendo tomada.
   */
  options?: ScoredOption[];
}

/**
 * Contrato de qualquer cérebro. Trocar de implementação (utilidade → GOAP →
 * rede neural) não exige mudar nenhum sistema da simulação.
 */
export interface Brain {
  readonly name: string;
  decide(perception: Perception): Decision;
}
