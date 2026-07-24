# save — Persistência

Salvar e carregar mundos no navegador.

**Responsabilidades:** serializar/desserializar o estado do mundo (incluindo a
seed do RNG, para reprodutibilidade) em IndexedDB; migração de versões de save.

**Depende de:** core, engine, world.
