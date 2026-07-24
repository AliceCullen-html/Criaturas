import { create } from 'zustand';

/**
 * Estado EXCLUSIVO de UI. Aqui NÃO vive nenhum dado da simulação
 * (criaturas, mundo, recursos) — isso mora em estruturas puras fora do React.
 * Este store guarda controles de interface e estatísticas agregadas para a HUD.
 */
export type SimulationSpeed = 0 | 1 | 2 | 4;

export interface SimulationStats {
  tick: number;
  population: number;
}

interface UiState {
  isRunning: boolean;
  speed: SimulationSpeed;
  stats: SimulationStats;
  toggleRunning: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
  setStats: (stats: SimulationStats) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isRunning: true,
  speed: 1,
  stats: { tick: 0, population: 0 },
  toggleRunning: () => set((state) => ({ isRunning: !state.isRunning })),
  setSpeed: (speed) => set({ speed }),
  setStats: (stats) => set({ stats }),
}));
