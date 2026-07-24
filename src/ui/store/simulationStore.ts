import { create } from 'zustand';
import type { CreatureSnapshot } from '@simulation';

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
}

interface UiState {
  isRunning: boolean;
  speed: SimulationSpeed;
  stats: SimulationStats;
  selectedId: number | null;
  followId: number | null;
  selected: CreatureSnapshot | null;
  toggleRunning: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
  setStats: (stats: SimulationStats) => void;
  setSelectedId: (id: number | null) => void;
  setFollowId: (id: number | null) => void;
  setSelected: (snapshot: CreatureSnapshot | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isRunning: true,
  speed: 1,
  stats: { tick: 0, population: 0, plants: 0 },
  selectedId: null,
  followId: null,
  selected: null,
  toggleRunning: () => set((state) => ({ isRunning: !state.isRunning })),
  setSpeed: (speed) => set({ speed }),
  setStats: (stats) => set({ stats }),
  setSelectedId: (id) => set({ selectedId: id }),
  setFollowId: (id) => set({ followId: id }),
  setSelected: (snapshot) => set({ selected: snapshot }),
}));
