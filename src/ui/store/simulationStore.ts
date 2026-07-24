import { create } from 'zustand';

/**
 * Estado EXCLUSIVO de UI. Aqui NÃO vive nenhum dado da simulação
 * (criaturas, mundo, recursos) — isso mora em estruturas puras fora do React,
 * conforme a arquitetura acordada. Este store guarda só controles de interface.
 */
export type SimulationSpeed = 0 | 1 | 2 | 4;

interface UiState {
  isRunning: boolean;
  speed: SimulationSpeed;
  toggleRunning: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isRunning: false,
  speed: 1,
  toggleRunning: () => set((state) => ({ isRunning: !state.isRunning })),
  setSpeed: (speed) => set({ speed }),
}));
