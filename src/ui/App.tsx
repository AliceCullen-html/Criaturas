import { SimulationCanvas } from './components/SimulationCanvas';
import { useUiStore, type SimulationSpeed } from './store/simulationStore';

export interface AppProps {
  mountCanvas: (container: HTMLElement) => () => void;
}

const SPEEDS: readonly SimulationSpeed[] = [0, 1, 2, 4];

export function App({ mountCanvas }: AppProps) {
  const isRunning = useUiStore((state) => state.isRunning);
  const speed = useUiStore((state) => state.speed);
  const toggleRunning = useUiStore((state) => state.toggleRunning);
  const setSpeed = useUiStore((state) => state.setSpeed);

  return (
    <div className="app">
      <SimulationCanvas mountCanvas={mountCanvas} />

      <aside className="hud">
        <header className="hud__header">
          <h1 className="hud__title">Criaturas</h1>
          <span className="hud__badge">Etapa 0 · Scaffold</span>
        </header>

        <div className="hud__controls">
          <button className="btn btn--primary" onClick={toggleRunning}>
            {isRunning ? 'Pausar' : 'Iniciar'}
          </button>

          <div className="speed" role="group" aria-label="Velocidade da simulação">
            {SPEEDS.map((value) => (
              <button
                key={value}
                className={`speed__btn${value === speed ? ' speed__btn--active' : ''}`}
                onClick={() => setSpeed(value)}
                aria-pressed={value === speed}
              >
                {value === 0 ? '⏸' : `${value}×`}
              </button>
            ))}
          </div>
        </div>

        <p className="hud__hint">
          Fundação pronta. O motor de simulação (ECS + loop) chega na Etapa 1.
        </p>
      </aside>
    </div>
  );
}
