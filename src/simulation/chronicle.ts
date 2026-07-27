import { defineResource, type World } from '@engine';

/**
 * O LIVRO DA HISTÓRIA.
 *
 * Um diário que o mundo escreve sozinho. Nasceu Luma. Morreu Kiro. A primeira
 * duplicação. O primeiro casal. A décima geração. A criatura mais velha que já
 * viveu neste jardim.
 *
 * Não é telemetria nem um log de depuração: é o que transforma uma população em
 * uma HISTÓRIA. Uma morte anônima é um sprite a menos; a morte de "Kiro, que
 * foi o primeiro a aprender onde ficava a água" é uma perda. O livro existe
 * para que o jogador possa olhar para trás e reconhecer o que viveu — e é dele
 * que vem o apego que nenhuma barra de status produz.
 *
 * Duas regras sustentam isso:
 *
 * - **Primeiras vezes são para sempre.** Um evento marcado como "primeira vez"
 *   só é registrado uma vez na vida do mundo. "A primeira fruta descoberta" só
 *   acontece uma vez; se acontecesse toda vez, deixaria de significar.
 * - **O livro não estoura.** Ele guarda as últimas centenas de entradas, mas
 *   nunca descarta uma primeira vez — essas são a espinha da narrativa.
 */

export interface ChronicleEntry {
  /** Tick da simulação em que aconteceu. */
  tick: number;
  text: string;
  /** Marcos da espécie ficam para sempre e aparecem em destaque. */
  landmark: boolean;
}

export interface Chronicle {
  entries: ChronicleEntry[];
  /** Chaves de acontecimentos que só valem uma vez. */
  seen: Set<string>;
}

export const ChronicleResource = defineResource<Chronicle>('Chronicle');

/** Quantas entradas comuns o livro guarda antes de esquecer as mais antigas. */
const MAX_ENTRIES = 400;

export function createChronicle(): Chronicle {
  return { entries: [], seen: new Set() };
}

/**
 * Registra um acontecimento.
 *
 * `key` identifica o tipo de evento; se `once` for verdadeiro, só a primeira
 * ocorrência entra no livro — é assim que "a primeira morte" continua sendo a
 * primeira morte depois de mil delas.
 */
export function chronicle(world: World, key: string, text: string, once = false): void {
  if (!world.hasResource(ChronicleResource)) return;
  const book = world.getResource(ChronicleResource);
  if (once) {
    if (book.seen.has(key)) return;
    book.seen.add(key);
  }

  book.entries.push({ tick: world.tick, text, landmark: once });

  if (book.entries.length > MAX_ENTRIES) {
    // Esquece o mais antigo que NÃO for marco. Os marcos são a espinha da
    // história do mundo; perdê-los seria perder o fio.
    const index = book.entries.findIndex((entry) => !entry.landmark);
    book.entries.splice(index >= 0 ? index : 0, 1);
  }
}

/** As últimas entradas, da mais recente para a mais antiga. */
export function recentEntries(world: World, count: number): ChronicleEntry[] {
  if (!world.hasResource(ChronicleResource)) return [];
  const { entries } = world.getResource(ChronicleResource);
  return entries.slice(-count).reverse();
}
