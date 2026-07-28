import { SimulationCanvas } from './components/SimulationCanvas';
import { CreatureCard } from './components/CreatureCard';
import { HistoryBook } from './components/HistoryBook';
import { ToolBelt } from './components/ToolBelt';

export interface AppProps {
  mountCanvas: (container: HTMLElement) => () => void;
}

/**
 * A tela inteira é o mundo.
 *
 * O que existe de interface cabe em três coisas que não pedem nada: o cinto
 * encostado na borda, com o que está na sua mão; o cartão que aparece ao tocar
 * numa criatura e some sozinho; e o sussurro do livro no canto. Nenhuma janela,
 * nenhum botão de ação — alimentar, brincar e dar banho acontecem no jardim,
 * com o mouse, em cima do bicho.
 */
export function App({ mountCanvas }: AppProps) {
  return (
    <div className="app">
      <SimulationCanvas mountCanvas={mountCanvas} />
      <ToolBelt />
      <CreatureCard />
      <HistoryBook />
    </div>
  );
}
