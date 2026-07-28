import { useEffect, useState } from 'react';
import { TOOL_COUNT, TOOL_HINTS, TOOL_NAMES } from '@core';
import { useUiStore } from '../store/simulationStore';
import beltUrl from '../../assets/ui/belt.png';
import { loadToolCursors } from '../toolCursor';

/**
 * O CINTO.
 *
 * É a única coisa parada na tela, e existe para poder ser esquecida: oito
 * botões desenhados como objetos pendurados, sem janela, sem aba, sem
 * confirmação. Clicar num deles não faz nada acontecer no jardim — só troca o
 * que está na sua mão. Tudo o que acontece de verdade, acontece depois, no
 * mundo, em cima de uma criatura ou de uma coisa.
 *
 * O atlas traz cada ferramenta em quatro estados (normal, sob o dedo, apertada,
 * indisponível). Usamos três: o repouso, o realce ao passar por cima e o
 * "apertado" para a que está na mão — assim o cinto conta o que você está
 * segurando sem escrever nada.
 */

/** Lado da célula no atlas em 4×. */
const CELL = 96;
/** Lado do botão na tela. */
const SIZE = 44;
/** Colunas do atlas: normal, hover, press, desabilitado. */
const STATE = { normal: 0, hover: 1, press: 2, off: 3 } as const;

export function ToolBelt() {
  const tool = useUiStore((state) => state.tool);
  const setTool = useUiStore((state) => state.setTool);
  const [hover, setHover] = useState(-1);
  const [cursors, setCursors] = useState<string[]>([]);

  // Os cursores são recortados uma vez, na abertura.
  useEffect(() => {
    let alive = true;
    void loadToolCursors().then((list) => {
      if (alive) setCursors(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  // A ferramenta na mão vira o cursor do jogo inteiro. Fica no `body` porque a
  // mão atravessa tudo: o jardim, o cinto, o livro da história.
  useEffect(() => {
    if (cursors.length === 0) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = cursors[tool] ?? 'auto';
    return () => {
      document.body.style.cursor = previous;
    };
  }, [cursors, tool]);

  // Os números escolhem a ferramenta sem tirar a mão do mouse. Não é um menu:
  // é o mesmo cinto, alcançado por outro caminho.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= TOOL_COUNT) setTool(digit - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool]);

  const slots = [];
  for (let i = 0; i < TOOL_COUNT; i++) {
    const state = tool === i ? STATE.press : hover === i ? STATE.hover : STATE.normal;
    slots.push(
      <button
        key={i}
        className="belt__slot"
        style={{
          width: SIZE,
          height: SIZE,
          backgroundImage: `url(${beltUrl})`,
          backgroundSize: `${(SIZE * 4 * CELL) / CELL}px ${(SIZE * 8 * CELL) / CELL}px`,
          backgroundPosition: `-${state * SIZE}px -${i * SIZE}px`,
        }}
        onMouseEnter={() => setHover(i)}
        onMouseLeave={() => setHover((was) => (was === i ? -1 : was))}
        onClick={() => setTool(i)}
        title={`${TOOL_NAMES[i]} — ${TOOL_HINTS[i]}`}
        aria-label={TOOL_NAMES[i]}
      />,
    );
  }

  return (
    <div className="belt">
      <div className="belt__grid">{slots}</div>
      <div className="belt__name">{TOOL_NAMES[tool]}</div>
      <div className="belt__hint">{TOOL_HINTS[tool]}</div>
    </div>
  );
}
