# rendering — Renderização

Adapter de saída para PixiJS. Lê o estado da simulação, nunca o modifica.

**Responsabilidades:** desenhar o snapshot, camada de sprites com pooling,
câmera (zoom/pan), interpolação entre ticks para 60fps suaves.

**Depende de:** core, engine.
