# rendering — Renderização

Adapter de saída para PixiJS. Lê o estado da simulação, nunca o modifica.

**Responsabilidades:** desenhar o snapshot, camada de sprites com pooling,
câmera (zoom/pan), interpolação entre ticks para 60fps suaves.

**Depende de:** core, engine.

## anim/ — o sistema de animação

Quatro peças, cada uma com um assunto só:

| arquivo                  | o que é                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `clipCatalog.ts`         | o CATÁLOGO. Lê a pasta de sprites e devolve as animações fatiadas.        |
| `Animator.ts`            | o MOTOR. Toca, enfileira, interrompe, mistura. Não conhece o jogo.        |
| `states.ts`              | a MÁQUINA DE ESTADOS. Uma tabela: dos sinais da criatura para a animação. |
| `AnimationController.ts` | a COLA. Um por criatura: junta os três e avisa nos quadros marcados.      |

### A pasta é o catálogo

Não existe lista de animações escrita em lugar nenhum. `clipCatalog.ts` varre
`src/assets/creatures/animations/**/*.png` com `import.meta.glob` e monta o
catálogo a partir dos nomes dos arquivos:

```
rotulo-legivel--chave--5frames.png
```

A **chave** é o que a máquina de estados pede (`caminhar`, `olharCima`,
`mastigar`); o rótulo é para gente ler. Acrescentar uma animação é largar um
PNG na pasta — nenhum código muda. As subpastas (`01-locomocao`, `06-emocoes`,
…) são as do artista e servem de categoria; o carregador não depende dos nomes
delas, então reorganizar a pasta amanhã também não quebra nada.

Geometria, conferida contra a largura real de cada arquivo na abertura: quadro
de 38×28 lógicos exportado em 4× (152×112), 16 px entre um quadro e o seguinte.
Uma tira que não fecha a conta é recusada com o nome dela no aviso, em vez de
virar uma animação silenciosamente torta.

### Quem pede o quê

A criatura não pede animação: ela informa o que está sentindo e fazendo
(`CreatureSignals`), e a tabela de `states.ts` resolve o resto. É por isso que
o laço de desenho não tem `if` de animação nenhum — e que um estado novo é uma
linha na tabela, não uma alteração no renderer.

O que vem de fora — um tapa, uma palavra dita, uma fruta encostada no focinho —
entra por `trigger`, com prioridade de interação: passa por cima do estado e o
estado volta sozinho quando a animação termina.

`clips.test.ts` roda a tabela inteira contra os arquivos que existem de
verdade: toda chave que a máquina pode chegar a pedir tem de ter PNG na pasta.
É o teste que pega o erro de digitação que, sem ele, apareceria como uma
criatura que simplesmente nunca faz aquilo.
