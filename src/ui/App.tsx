import { SimulationCanvas } from './components/SimulationCanvas';
import { useUiStore, type SimulationSpeed } from './store/simulationStore';

export interface AppProps {
  mountCanvas: (container: HTMLElement) => () => void;
}

const SPEEDS: readonly SimulationSpeed[] = [0, 1, 2, 4];

export function App({ mountCanvas }: AppProps) {
  const isRunning = useUiStore((state) => state.isRunning);
  const speed = useUiStore((state) => state.speed);
  const stats = useUiStore((state) => state.stats);
  const toggleRunning = useUiStore((state) => state.toggleRunning);
  const setSpeed = useUiStore((state) => state.setSpeed);

  return (
    <div className="app">
      <SimulationCanvas mountCanvas={mountCanvas} />

      <aside className="hud">
        <header className="hud__header">
          <h1 className="hud__title">Criaturas</h1>
          <span className="hud__badge">Etapa 2 · Mundo</span>
        </header>

        <div className="hud__stats">
          <div className="stat">
            <span className="stat__label">Tick</span>
            <span className="stat__value">{stats.tick.toLocaleString('pt-BR')}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Plantas</span>
            <span className="stat__value">{stats.population}</span>
          </div>
        </div>

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
          As plantas crescem e se espalham pelo solo (nunca na água), com limite de população. As
          criaturas chegam na Etapa 3.
        </p>
      </aside>
    </div>
  );
}
