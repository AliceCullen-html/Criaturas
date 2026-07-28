import { useEffect, useState } from 'react';
import { TOOL, TOOL_COUNT, TOOL_HINTS, TOOL_NAMES } from '@core';
import { useUiStore } from '../store/simulationStore';
import beltUrl from '../../assets/ui/belt.png';

/**
 * O CINTO.
 *
 * O CURSOR DA FERRAMENTA NÃO MORA AQUI. Ele é desenhado DENTRO do jardim, pelo
 * renderer, junto com a mão — porque é lá que a maçã encosta na criatura. Já
 * existiu uma versão que trocava o cursor do documento inteiro, e o efeito era
 * a esponja seguindo o mouse por cima do próprio cinto e do livro: a interface
 * ficava sem ponteiro e ninguém sabia mais onde estava clicando.
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

  // Os números escolhem a ferramenta sem tirar a mão do mouse. Não é um menu:
  // é o mesmo cinto, alcançado por outro caminho.
  //
  // E o ESC larga o que está na mão. A ferramenta ficar até ser trocada é a
  // regra certa — só faltava um jeito de NÃO estar com nada: antes, escolher a
  // esponja era ficar com a esponja para sempre, e a única saída era escolher
  // outra coisa. Largar volta para a mão vazia, que é a ferramenta que pega,
  // arrasta e manda.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setTool(TOOL.hand);
        return;
      }
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
        // Clicar na ferramenta que já está na mão a devolve ao cinto: é o
        // mesmo gesto de guardar, sem precisar procurar outra.
        onClick={() => setTool(tool === i ? TOOL.hand : i)}
        title={`${TOOL_NAMES[i]} — ${TOOL_HINTS[i]}`}
        aria-label={TOOL_NAMES[i]}
      />,
    );
  }

  return (
    <div className="belt">
      <div className="belt__grid">{slots}</div>
      <div className="belt__name">{TOOL_NAMES[tool]}</div>
      <div className="belt__hint">
        {TOOL_HINTS[tool]}
        {/* Com algo na mão, o jogo diz como largar. Sem isto, a única saída
            era pegar outra ferramenta — e ficar com a esponja para sempre. */}
        {tool !== TOOL.hand && <span className="belt__drop"> · esc larga</span>}
      </div>
    </div>
  );
}
