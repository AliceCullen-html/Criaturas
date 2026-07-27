import { create } from 'zustand';
import type { ChronicleEntry, CreatureSnapshot } from '@simulation';

/**
 * Estado EXCLUSIVO de UI. Não guarda dados da simulação em si — apenas
 * controles de interface, seleção e um retrato (snapshot) da criatura
 * selecionada, atualizado pelo composition root a cada poucos quadros.
 */
export type SimulationSpeed = 0 | 1 | 2 | 4;

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
  setRunning: (running: boolean) => void;
  toggleRunning: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
  setStats: (stats: SimulationStats) => void;
  setSelectedId: (id: number | null) => void;
  setSelectedIds: (ids: number[]) => void;
  setFollowId: (id: number | null) => void;
  setSelected: (snapshot: CreatureSnapshot | null) => void;
  setChronicle: (recent: ChronicleEntry[], book: ChronicleEntry[]) => void;
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
  toggleRunning: () => set((state) => ({ isRunning: !state.isRunning })),
  setRunning: (running) => set({ isRunning: running }),
  setSpeed: (speed) => set({ speed }),
  setStats: (stats) => set({ stats }),
  setSelectedId: (id) => set({ selectedId: id, selectedIds: id === null ? [] : [id] }),
  setSelectedIds: (ids) => set({ selectedIds: ids, selectedId: ids[0] ?? null }),
  setFollowId: (id) => set({ followId: id }),
  setSelected: (snapshot) => set({ selected: snapshot }),
  setChronicle: (recent, book) => set({ recent, book }),
}));
