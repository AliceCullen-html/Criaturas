import { useEffect, useRef } from 'react';

interface SimulationCanvasProps {
  /**
   * Monta o renderer no elemento fornecido e devolve uma função de limpeza.
   * A UI não conhece PixiJS: recebe essa função do composition root, mantendo
   * a regra de dependência da arquitetura.
   */
  mountCanvas: (container: HTMLElement) => () => void;
}

export function SimulationCanvas({ mountCanvas }: SimulationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return mountCanvas(container);
  }, [mountCanvas]);

  return <div ref={containerRef} className="sim-canvas" />;
}
