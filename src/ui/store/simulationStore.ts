import { create } from 'zustand';
import { TOOL } from '@core';
import type { ScoredOption } from '@ai';
import type { ChronicleEntry, CreatureSnapshot } from '@simulation';

/**
 * Estado EXCLUSIVO de UI. Não guarda dados da simulação em si — apenas
 * controles de interface, seleção e um retrato (snapshot) da criatura
 * selecionada, atualizado pelo composition root a cada poucos quadros.
 */
/**
 * As MARCHAS DO TEMPO.
 *
 * Iam até 4×, que serve para não esperar a criatura atravessar o jardim. Não
 * serve para o que este jogo é: um jardim que se quer deixar rodando e ao qual
 * se volta para ver o que aconteceu. Gerações, tradições e amizades levam
 * horas de tempo de jardim — em 4× isso ainda é uma tarde inteira de tempo de
 * gente.
 *
 * O passo da simulação não muda com a marcha: o que muda é quantos passos
 * cabem num segundo real. O jardim em 32× é o MESMO jardim, só visto depressa.
 */
export type SimulationSpeed = 0 | 1 | 2 | 4 | 8 | 16 | 32;

/** As marchas na ordem em que aparecem no controle. */
export const SPEEDS: readonly SimulationSpeed[] = [1, 2, 4, 8, 16, 32];

export interface SimulationStats {
  tick: number;
  population: number;
  plants: number;
  items: number;
}

interface UiState {
  isRunning: boolean;
  speed: SimulationSpeed;
  stats: SimulationStats;
  selectedId: number | null;
  /**
   * O GRUPO selecionado pelo retângulo. `selectedId` continua sendo quem
   * aparece na ficha — uma ficha só cabe uma criatura —, mas as ordens valem
   * para todos daqui.
   */
  selectedIds: number[];
  followId: number | null;
  selected: CreatureSnapshot | null;
  /** As últimas coisas que aconteceram, para o sussurro no canto. */
  recent: ChronicleEntry[];
  /** O livro inteiro, da mais recente para a mais antiga. */
  book: ChronicleEntry[];
  /**
   * A ferramenta na mão, índice em `TOOL` de @core.
   *
   * É o único estado de interface que muda o significado de um clique no
   * mundo — e por isso mora aqui, onde o cinto escreve e o jogo lê.
   */
  tool: number;
  /**
   * O painel de dentro da cabeça dela, ligado ou desligado.
   *
   * Fica desligado por padrão, e é assim que tem de ser: o jogo é olhar o
   * jardim e não entender tudo. Mas quem está construindo o bicho precisa poder
   * abrir a tampa e ver a conta que ele acabou de fazer.
   */
  debug: boolean;
  /** A última conta do cérebro da criatura observada, para o painel. */
  thinking: { options: ScoredOption[]; tick: number } | null;
  setRunning: (running: boolean) => void;
  setThinking: (thinking: { options: ScoredOption[]; tick: number } | null) => void;
  toggleDebug: () => void;
  toggleRunning: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
  setStats: (stats: SimulationStats) => void;
  setSelectedId: (id: number | null) => void;
  setSelectedIds: (ids: number[]) => void;
  setFollowId: (id: number | null) => void;
  setSelected: (snapshot: CreatureSnapshot | null) => void;
  setChronicle: (recent: ChronicleEntry[], book: ChronicleEntry[]) => void;
  setTool: (tool: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isRunning: true,
  speed: 1,
  stats: { tick: 0, population: 0, plants: 0, items: 0 },
  selectedId: null,
  selectedIds: [],
  followId: null,
  selected: null,
  recent: [],
  book: [],
  // A mão aberta é o começo: pegar as coisas é o gesto mais antigo do jogo.
  tool: TOOL.hand,
  debug: false,
  thinking: null,
  toggleRunning: () => set((state) => ({ isRunning: !state.isRunning })),
  toggleDebug: () => set((state) => ({ debug: !state.debug, thinking: null })),
  setThinking: (thinking) => set({ thinking }),
  setRunning: (running) => set({ isRunning: running }),
  setSpeed: (speed) => set({ speed }),
  setStats: (stats) => set({ stats }),
  setSelectedId: (id) => set({ selectedId: id, selectedIds: id === null ? [] : [id] }),
  setSelectedIds: (ids) => set({ selectedIds: ids, selectedId: ids[0] ?? null }),
  setFollowId: (id) => set({ followId: id }),
  setSelected: (snapshot) => set({ selected: snapshot }),
  setChronicle: (recent, book) => set({ recent, book }),
  setTool: (tool) => set({ tool }),
}));
