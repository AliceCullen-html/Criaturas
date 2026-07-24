import { SimulationCanvas } from './components/SimulationCanvas';
import { CreaturePanel } from './components/CreaturePanel';
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
          <span className="hud__badge">Mundo vivo</span>
        </header>

        <div className="hud__stats">
          <div className="stat">
            <span className="stat__label">Criaturas</span>
            <span className="stat__value">{stats.population}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Frutas</span>
            <span className="stat__value">{stats.items}</span>
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

        <ul className="hud__gestures">
          <li>
            <b>Arraste</b> uma fruta até uma criatura para oferecer
          </li>
          <li>
            <b>Segure e deslize devagar</b> sobre ela para fazer carinho
          </li>
          <li>
            <b>Gesto brusco</b> a assusta — e ela lembra disso
          </li>
          <li>
            <b>Duplo clique</b> chama a atenção · <b>clique</b> observa
          </li>
          <li>
            <b>Roda</b> dá zoom · <b>botão do meio</b> move a câmera
          </li>
        </ul>
      </aside>

      <CreaturePanel />
    </div>
  );
}
