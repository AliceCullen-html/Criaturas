import { defineResource } from '@engine';
import type { ScoredOption } from '@ai';

/**
 * A CRIATURA QUE ALGUÉM ESTÁ OLHANDO POR DENTRO.
 *
 * Existe uma só, e é sempre a que está aberta no painel. Ela é o motivo pelo
 * qual o cérebro pode devolver a lista de opções pontuadas sem custo: essa
 * lista é a coisa mais cara que ele produziria — uma alocação por decisão, por
 * criatura, várias vezes por segundo — e ninguém a leria. Com um alvo só, ela é
 * calculada uma vez por decisão e para uma criatura.
 *
 * O último resultado fica guardado aqui porque a decisão não acontece todo
 * quadro: ela tem compromisso, e entre uma decisão e a seguinte passam
 * segundos. Sem guardar, o painel piscaria vazio quase o tempo todo.
 */
export interface Watched {
  /** Quem está sendo observado, ou -1. */
  id: number;
  /** A última conta que o cérebro dela fez. */
  options: ScoredOption[];
  /** Em que tique aquela conta foi feita, para o painel dizer se está fresca. */
  tick: number;
}

export const WatchedResource = defineResource<Watched>('watched');

export function createWatched(): Watched {
  return { id: -1, options: [], tick: 0 };
}
