import { SimulationCanvas } from './components/SimulationCanvas';
import { CreatureCard } from './components/CreatureCard';
import { HistoryBook } from './components/HistoryBook';

export interface AppProps {
  mountCanvas: (container: HTMLElement) => () => void;
}

/**
 * A tela inteira é o mundo. Não há HUD, menus nem botões: quando nenhuma
 * criatura está selecionada, não aparece absolutamente nada. Clicar numa
 * criatura mostra um cartão pequeno ao lado dela, que some sozinho.
 */
export function App({ mountCanvas }: AppProps) {
  return (
    <div className="app">
      <SimulationCanvas mountCanvas={mountCanvas} />
      <CreatureCard />
      <HistoryBook />
    </div>
  );
}
