# Arquitetura — Criaturas

Documento vivo de arquitetura. Descreve as decisões estruturais do projeto, o
racional por trás delas e o roadmap do MVP até a v1.0.

---

## 1. Princípios

O desenho se apoia em três ideias que se reforçam:

1. **Clean Architecture (regra de dependência).** O núcleo da simulação (as
   "regras do jogo") não conhece React, PixiJS nem o navegador. Frameworks são
   _detalhes_ nas bordas. Ganhos: testabilidade, longevidade e liberdade de
   trocar qualquer camada externa.
2. **ECS (Entity-Component-System).** Criaturas e mundo são modelados como
   dados (componentes) + sistemas (regras), em vez de objetos monolíticos.
   Atende performance (dados contíguos, _cache-friendly_, _object pooling_) e
   modularidade (arquivos pequenos, sistemas desacoplados, composição sobre
   herança).
3. **Loop com timestep fixo e determinístico.** A simulação avança em passos
   fixos (ex.: 20 Hz lógicos); o render interpola para 60fps. Com um **RNG
   semeado** (nunca `Math.random`), o mundo é reproduzível — base para
   save/load confiável, replays e depuração da evolução genética.

## 2. Decisões-chave e trade-offs

- **Estado da simulação fora do Zustand.** Zustand guarda só estado de UI
  (seleção, câmera, painéis, velocidade, estatísticas agregadas). Os dados
  quentes das criaturas vivem em estruturas puras, evitando re-renders do React
  e pressão de GC a cada tick.
- **ECS em vez de OOP clássico.** Evita o "God object" `Creature` e engessamento
  por herança; escala melhor para centenas de entidades.
- **Movimento contínuo.** Posições em ponto flutuante (criaturas deslizam
  suavemente), com uma grade apenas para terreno/recursos e um _spatial hash_
  para consultas de vizinhança eficientes.
- **Web Worker: arquitetar agora, ativar depois.** A fronteira "simulação ↔
  mundo externo" é desenhada como interface limpa (UI/render só leem
  _snapshots_) desde o início; mover a simulação para uma Worker depois não
  exige reescrever a lógica.

## 3. Camadas (a dependência aponta sempre para dentro)

```
DRIVERS/FRAMEWORKS   React · PixiJS · IndexedDB · Vite
ADAPTERS             rendering/ · ui/ · save/
APLICAÇÃO            simulation/
DOMÍNIO              creatures/ · genetics/ · ai/ · world/
KERNEL               core/  (sem dependências)
```

Regra de ouro: `rendering/` e `ui/` **leem** o estado da simulação, mas
**nunca escrevem** nele — toda mutação ocorre dentro dos sistemas. Essa regra é
verificada automaticamente pelo ESLint (`eslint-plugin-boundaries`).

## 4. Módulos e responsabilidades

| Módulo         | Responsabilidade                                                                 | Depende de                         |
| -------------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| **core**       | Math (vetores 2D), RNG semeado, object pool, event bus, spatial hash, tipos base | nada                               |
| **engine**     | ECS (entidades/componentes/sistemas), loop de timestep fixo, snapshots           | core                               |
| **world**      | Terreno, recursos, plantas, clima, temperatura, dia/noite, estações              | core, engine                       |
| **creatures**  | Componentes de criatura e blueprint de montagem                                  | core, engine                       |
| **genetics**   | Genoma, genótipo→fenótipo, cruzamento, mutação                                   | core                               |
| **ai**         | Interface `Brain` (percepção→intenção) e implementações plugáveis                | core, engine, creatures            |
| **simulation** | Sistemas que aplicam as regras a cada tick; define o snapshot                    | core, engine, world, creatures, genetics, ai |
| **rendering**  | Adapter PixiJS: desenha o snapshot, câmera, interpolação, pooling de sprites     | core, engine, assets               |
| **ui**         | React + Zustand: HUD, inspetor, painéis, controles                               | core, engine, simulation           |
| **save**       | Serialização e persistência em IndexedDB (inclui a seed)                          | core, engine, world                |
| **app**        | Composition root: instancia e conecta tudo                                        | todas                              |
| **assets**     | Sprites, paletas, dados estáticos                                                 | nada                               |

### Destaques de design

- **Interface `Brain`.** Todo cérebro recebe uma _percepção_ e devolve uma
  _intenção_. O sistema de decisão não sabe se por trás há FSM, Behavior Tree ou
  rede neural — o que permite evoluir a IA (FSM → BT → GOAP → NN → GA) sem
  reescrever a simulação (princípio Aberto/Fechado).
- **Genótipo vs. fenótipo.** O DNA cru (herdado e mutado) é separado dos
  atributos resultantes, mantendo a evolução limpa e flexível.

## 5. Roadmap

### MVP

| Etapa | Entrega                                                                    |
| ----- | ------------------------------------------------------------------------- |
| 0     | Scaffold: build, lint/format, estrutura de camadas, canvas Pixi vazio     |
| 1     | Núcleo ECS + loop de timestep fixo + RNG semeado (uma entidade se move)   |
| 2     | Mundo: grade de terreno, recursos, spatial hash; plantas crescem          |
| 3     | Criaturas + componentes + metabolismo/necessidades + movimento básico     |
| 4     | Percepção + cérebro State Machine (buscar comida/água, vagar, dormir, fugir) |
| 5     | Genética: genoma, cruzamento, mutação; filhotes com diversidade           |
| 6     | Ciclo natural: dia/noite, clima, temperatura, estações                    |
| 7     | Save/Load em IndexedDB com seed (mundo reproduzível)                       |
| 8     | HUD e inspetor: painéis, estatísticas, controles de velocidade            |

### Dar vida (fase atual)

A partir daqui a régua deixou de ser "quantos sistemas existem" e passou a ser
**acreditar**: observar uma criatura por cinco minutos e sentir que ela tem
personalidade própria. Nada entra se não servir a isso.

| Etapa | Entrega                                                                   |
| ----- | ------------------------------------------------------------------------- |
| A ✅  | Mundo compacto: densidades proporcionais à área, jardim que se sustenta   |
| B ✅  | Microcomportamentos: canal de **pose** separado do humor, 17 gestos ociosos |
| — ✅  | Celular: toque, dois dedos para câmera, layout responsivo; pedras que prendem |
| C ✅  | Pequenas histórias: camada de **rotinas** encadeadas; criaturas carregam objetos |
| — ✅  | Vista isométrica 2:1 e jardim maior (900×900), sem tocar na simulação        |
| — ✅  | Tabuleiro: chão em casas, uma peça por casa; arrastar cenário e plantar      |
| — ✅  | Tintim: a folha de sprites desenhada à mão substitui a arte procedural       |
| D     | Vida social e ninhos: amigos, desafetos, esperar, dormir junto, luto      |
| E     | Som: voz sintetizada do genoma, chamados, risadas, choro de filhote       |
| F     | Linguagem: vocabulário, computador de ensino, aprender observando         |

Critérios de aceitação da fase, verificados por teste:

- `garden.test.ts` roda o mundo por 30 minutos simulados em três seeds e cobra
  população viva e **ninguém sozinho**. Sem isso nenhuma história social
  acontece.
- `routines.test.ts` cobra que as histórias **cheguem ao fim** sozinhas: num
  jardim comum de 10 minutos, quantas correntes completas aconteceram sem o
  jogador tocar em nada.
- `observation.test.ts` é a **regra principal virada em verificação**: segue uma
  criatura por cinco minutos, escreve a vida dela em frases e cobra variedade —
  e compara o terço mais preguiçoso com o terço mais agitado do jardim para
  provar que a personalidade aparece no comportamento, não só na ficha.

### A vista isométrica mora só no renderer

A simulação continua num plano cartesiano visto de cima: `Transform` guarda
`x`/`y` do mundo, distâncias são euclidianas, colisão é círculo contra círculo.
Nada disso muda por causa da perspectiva. A projeção (`rendering/iso.ts`) é uma
troca de eixos aplicada na hora de desenhar, e o desenho se divide em duas
famílias:

- **o chão** (grama, areia, água, sombras, poças) num container com a matriz
  isométrica — quadrados viram losangos de graça;
- **o que fica em pé** (criaturas, árvores, objetos) num container sem
  transformação, onde só a _posição_ é projetada. Um sprite inclinado 45° não
  seria isométrico, seria uma criatura tombada.

Duas consequências valem o registro. A profundidade passa a ser `x + y`, não
`y` — é o que impede a árvore do fundo de cobrir a criatura da frente, e por
isso o cenário virou parte da mesma camada ordenada das criaturas. E o clique
precisa do inverso exato da projeção (`unIso`): sem ele o jogador acerta um
lugar e o jogo entende outro.

### O jardim é um tabuleiro

O chão é feito de casas quadradas de 50 pixels (`core/grid.ts`), e cada árvore,
pedra ou moita ocupa **uma casa inteira**. A grade mora em `@core` pela mesma
razão que as poses: é o único vocabulário que a simulação e o renderer têm de
ler igual, e nenhum dos dois pode importar o outro.

A grade governa só o cenário. As criaturas continuam contínuas — andam em ponto
flutuante, cortam casas pelo meio e não sabem que elas existem. Nada ficou
sólido por causa da grade: uma árvore não é parede.

O que a casa habilita é a MOBÍLIA. Segurando um instante a mais que o necessário
para sacudir, a árvore ou a pedra sai do chão, acompanha a mão e pousa noutra
casa; se a casa estiver ocupada ou molhada, a peça volta para onde estava. E uma
semente pousada com cuidado numa casa vazia vira muda — atirada, continua sendo
semente rolando pelo chão, porque plantar é um gesto, não um resultado. A muda
leva dois minutos e meio para crescer e só então dá fruta.

Do lado do desenho, o tabuleiro sai de graça: as casas são **quadrados**
desenhados dentro do container do chão, que já carrega a matriz isométrica. Não
há nenhuma conta de losango no renderer — o que dá a cara de piso é o
acabamento das bordas, porque as duas bordas "da frente" do quadrado projetado
viram as arestas iluminadas do losango.

### Mirar no que está DESENHADO, não no chão

O bug mais caro desta fase foi de mira, não de arrasto: não dava para pegar
nada. O ponteiro devolve um ponto do **chão** — a casa onde o dedo pousou. Uma
árvore, porém, não está deitada: ela sobe pela tela. Encostar no meio da copa
devolvia um ponto do mundo uma casa e meia atrás da árvore, e a pergunta "que
peça está aqui?" respondia *nenhuma*.

A regra correta (`insideSprite`) desfaz a projeção: converte o ponto do mundo
de volta para o deslocamento em TELA relativo ao pé da peça e compara com o
retângulo que o sprite ocupa. Vale para qualquer zoom, porque sprite e mundo
são ampliados pelo mesmo fator, e vale igual para objetos soltos. Está fixada
em `rendering/picking.test.ts`, que roda sem navegador.

O segundo motivo era o gesto: pegar exigia segurar **e mexer**. Quem apertava e
esperava — o que todo mundo faz num celular — não levantava nada. Agora o
relógio corre com o dedo parado (0,18s para um objeto, 0,45s para cenário), e a
peça **treme** enquanto cede, para o jogador saber que vale continuar segurando.

### A criatura vem de uma folha desenhada à mão

Até aqui a criatura era gerada por código: um corpo montado de elipses com as
cores do genoma, e um rosto numa segunda camada que trocava com a emoção sem
redesenhar o corpo. Foi substituída pela folha do **Tintim** — 512×192, oito
colunas por três linhas de células de 64×64, com o desenho de verdade em 16×16
ampliado quatro vezes.

A leitura (`textures/tintimSheet.ts`) **desfaz a ampliação** e guarda os 16×16
originais numa tira única de vinte recortes. Redesenhar a partir do original e
ampliar por um inteiro é o que mantém o pixel quadrado; usar a célula de 64 e
encolher por um fator quebrado borraria a arte que ela veio trazer.

Duas consequências:

- **Uma camada em vez de duas.** Corpo e rosto separados existiam porque a arte
  era gerada; com quadros inteiros desenhados, cada estado é um quadro só.
- **A deformação foi contida a um terço.** Achatar e girar era barato quando o
  corpo era procedural; sobre pixel art, desmancha a grade. O movimento agora é
  quase todo por posição — o pulinho, o tremor —, que não distorce nada.

A tradução de comportamento para quadro é `frameFor`, o único ponto onde a arte
encontra a simulação, e está coberta por `tintimFrames.test.ts`: a ordem de
importância (dor antes do passo, sono antes do humor) é o que impede a criatura
de mentir sobre o que está sentindo.

### Invariantes de geração do mundo

O jardim é sorteado, mas não pode sortear um mundo inviável. A geração
**verifica**, em vez de confiar em distâncias mágicas:

- **Piso de água** (`terrain.ts`): sem lago suficiente a população morre de sede.
- **Nenhuma pedra corta o jardim** (`connectivity.ts`): pôr uma pedra grande só
  pode consumir a área dela mesma; se desconectasse um pedaço, ela não vai ali.
  Encurralar continua possível — mas só com as mãos de quem joga.
- **Ninguém nasce em ilha** (`spawnCreatures`): criaturas só surgem na maior
  região contínua, e a até 200 pixels de água.
- **Uma peça por casa** (`scenery.ts`): o cenário nasce alinhado à grade, nunca
  dentro do lago, nunca encostado noutra peça.

### A sede precisa de memória, não só de vista

Um achado que vale ficar registrado, porque quase não aparecia. A criatura só
recebia a opção de beber quando havia água **dentro do campo de visão**. Como o
lago fica longe da maior parte do jardim, uma criatura com sede máxima
simplesmente não tinha "beber" na lista de opções — e morria brincando, com o
lago a duzentos pixels. Medido em cinco minutos de simulação: **28 das 34
criaturas iniciais** morriam de sede sem jamais terem ido à água.

O alcance da água passou a ser `visão + sede × 700`. Bicho nenhum precisa VER o
bebedouro para saber onde ele fica; satisfeita, a criatura só repara na água à
vista; morrendo de sede, ela sabe atravessar o jardim. Com isso o jardim deixou
de encolher no primeiro minuto: a população **cresce** de 34 para ~60 em trinta
minutos, e a companhia subiu de 92% para 96–99%.

### Rumo à v1.0

- GOAP (planejamento orientado a objetivos) sobre a camada de rotinas.
- Redes neurais simples + Algoritmo Genético (o cérebro passa a evoluir no DNA).
- Performance: simulação em Web Worker, pooling e spatial partitioning endurecidos.
- Save/Load em IndexedDB (`src/save/` ainda vazio).

## 6. Forma de trabalho

Desenvolvimento por etapas. Cada etapa passa por: planejamento → explicação →
código → revisão → refatoração, e só avança após aprovação.
