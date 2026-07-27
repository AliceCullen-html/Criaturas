import { useEffect, useState } from 'react';
import { useUiStore } from '../store/simulationStore';

/**
 * O LIVRO DA HISTÓRIA.
 *
 * Duas camadas, nenhuma delas um menu:
 *
 * - **O sussurro**: as últimas coisas que aconteceram passam no canto e
 *   desaparecem sozinhas. É o mundo avisando, não um painel informando.
 * - **O livro**: a tecla H abre tudo o que já aconteceu naquele jardim, dos
 *   marcos da espécie às mortes de ontem. Fica fechado por padrão porque a
 *   tela é do mundo, não da interface.
 *
 * Sem isto, uma morte é um sprite a menos. Com isto, é a morte de Kiro — e é
 * disso que nasce o apego que nenhuma barra de status produz.
 */
export function HistoryBook() {
  const recent = useUiStore((state) => state.recent);
  const book = useUiStore((state) => state.book);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'h' || event.key === 'H') setOpen((was) => !was);
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (open) {
    return (
      <div className="book" onClick={() => setOpen(false)}>
        <div className="book__title">a história deste jardim</div>
        {book.length === 0 && <div className="book__line">nada aconteceu ainda</div>}
        {book.map((entry, i) => (
          <div
            key={`${entry.tick}-${i}`}
            className={entry.landmark ? 'book__line book__line--mark' : 'book__line'}
          >
            {entry.text}
          </div>
        ))}
      </div>
    );
  }

  if (recent.length === 0) return null;
  return (
    <div className="whisper">
      {recent.map((entry, i) => (
        <div
          key={`${entry.tick}-${i}`}
          className={entry.landmark ? 'whisper__line whisper__line--mark' : 'whisper__line'}
          style={{ opacity: 1 - i * 0.32 }}
        >
          {entry.text}
        </div>
      ))}
    </div>
  );
}
