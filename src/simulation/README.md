# simulation — Regras da Simulação

Camada de casos de uso: orquestra domínio + engine a cada tick.

**Responsabilidades:** os sistemas ECS que aplicam as regras — percepção,
metabolismo/necessidades, decisão (chama o `Brain`), movimento, alimentação,
reprodução, envelhecimento/morte, combate/fuga. Também define o formato do
snapshot consumido pelo render e pela UI.

**Depende de:** core, engine, world, creatures, genetics, ai.
