import { SPEEDS, useUiStore } from '../store/simulationStore';

/**
 * O RELÓGIO DO JARDIM.
 *
 * A tela é do mundo, e este é o segundo botão do jogo — o primeiro é a maçaneta
 * do livro, ao lado. Ele existe porque o que este jogo tem para mostrar não
 * acontece em cinco minutos: uma amizade, uma tradição, três gerações. Sem uma
 * marcha alta, quem quisesse ver isso teria de deixar a aba aberta a tarde
 * inteira — e o jogo estaria contando uma história que ninguém chega a ler.
 *
 * Acelerar não é trapaça, e nem muda o jardim: o passo da simulação continua o
 * mesmo, o que muda é quantos passos cabem num segundo de relógio de parede. Em
 * 32× o mesmo jardim acontece, só que meia hora dele passa em um minuto seu.
 *
 * A pausa fica no mesmo lugar porque é a mesma pergunta — "quanto tempo passa
 * agora?" —, e porque parar para olhar uma criatura de perto é metade do jogo.
 */
export function TimeControl() {
  const speed = useUiStore((s) => s.speed);
  const isRunning = useUiStore((s) => s.isRunning);
  const setSpeed = useUiStore((s) => s.setSpeed);
  const toggleRunning = useUiStore((s) => s.toggleRunning);
  const debug = useUiStore((s) => s.debug);
  const toggleDebug = useUiStore((s) => s.toggleDebug);

  return (
    <div className="clock">
      <button
        type="button"
        className="clock__gear clock__gear--pause"
        onClick={toggleRunning}
        title={isRunning ? 'Pausar (espaço)' : 'Continuar (espaço)'}
        aria-label={isRunning ? 'Pausar' : 'Continuar'}
      >
        {isRunning ? '❚❚' : '▶'}
      </button>
      {SPEEDS.map((gear) => (
        <button
          key={gear}
          type="button"
          className={`clock__gear${isRunning && speed === gear ? ' clock__gear--on' : ''}`}
          onClick={() => {
            setSpeed(gear);
            if (!isRunning) toggleRunning();
          }}
          title={`${gear}× — ${legenda(gear)}`}
        >
          {gear}×
        </button>
      ))}
      <button
        type="button"
        className={`clock__gear clock__gear--eye${debug ? ' clock__gear--on' : ''}`}
        onClick={toggleDebug}
        title="Ver a cabeça dela (D)"
        aria-label="Painel de depuração"
      >
        ◉
      </button>
    </div>
  );
}

/** Quanto tempo de jardim passa em um minuto seu, para o controle não ser só um número. */
function legenda(gear: number): string {
  const minutos = gear;
  return minutos < 60
    ? `${minutos} min de jardim por minuto`
    : `${Math.round(minutos / 60)} h de jardim por minuto`;
}
