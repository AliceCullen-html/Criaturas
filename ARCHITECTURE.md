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
| **core**       | Math (vetores 2D), RNG semeado, spatial hash, grade do tabuleiro, memória associativa e vocabulário | nada                               |
| **engine**     | ECS (entidades/componentes/sistemas), loop de timestep fixo, snapshots           | core                               |
| **world**      | Terreno, recursos, plantas, clima, temperatura, dia/noite, estações              | core, engine                       |
| **creatures**  | Componentes de criatura e blueprint de montagem                                  | core, engine                       |
| **genetics**   | Genoma, genótipo→fenótipo, cruzamento, mutação                                   | core                               |
| **ai**         | Interface `Brain` (percepção→intenção) e implementações plugáveis                | core, engine, creatures            |
| **simulation** | Sistemas que aplicam as regras a cada tick; define o snapshot                    | core, engine, world, creatures, genetics, ai |
| **rendering**  | Adapter PixiJS: desenha o snapshot, câmera, interpolação, pooling de sprites     | core, engine, assets               |
| **audio**      | Música de fundo (e, adiante, a voz sintetizada das criaturas)                     | core, assets                       |
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

### A filosofia

O projeto não é um jogo casual: é um **mundo vivo**. A régua não é gráfica, é
a sensação de que existe uma civilização acontecendo independentemente de quem
olha. O jogador não recebe missões — ele **interfere**. As criaturas têm livre
arbítrio, e mesmo sem ninguém tocar em nada elas vivem, aprendem, fazem amizade,
brigam, têm filhos, envelhecem e morrem.

Três compromissos que decidem qualquer dúvida de design:

1. **Nenhuma criatura é igual à outra.** Nunca centenas de NPCs iguais: cada uma
   é um ser pequeno e específico, reconhecível depois de horas de jogo.
2. **O mundo conta histórias que ninguém escreveu.** Nada de roteiro; o enredo
   sai do encontro entre sistemas simples.
3. **A interface some.** Quase tudo acontece com o mouse, direto no mundo. Um
   menu é a última saída, não a primeira.

### O ovo, e a ausência que o define

Toda criatura deste jardim nasce de um ovo — a primeira inclusive. O jogo abre
com uma casca parada no chão, e a câmera abre olhando para ela.

A decisão que sustenta isso é o que o ovo **não tem**: enquanto está na casca, a
entidade existe inteira — genoma, nome, aparência, linhagem, memória — mas *não
carrega o marcador `Creature`*. Todos os sistemas do jogo varrem `Creature`:
decidir, andar, comer, sentir fome, envelhecer, fazer amizade, aprender
palavras, se duplicar. Um ovo não faz nada disso, e não faz porque simplesmente
**não está na lista**. Nenhum sistema precisou ganhar uma exceção — e o que for
escrito amanhã também vai passar direto por ele. Ao romper, a mesma entidade
ganha o marcador e continua a mesma: o nome que estava no ovo é o nome de quem
saiu dele.

Só dois lugares precisaram saber que ovos existem, e ambos por bons motivos:

- **O desenho.** Os ovos entram no mesmo buffer das criaturas, com um canal que
  diz "esta linha é uma casca". Assim eles ocupam o mesmo lugar no mundo, têm a
  mesma sombra, entram na mesma ordenação por profundidade e se clicam do mesmo
  jeito. O ovo balança cada vez mais perto da hora, e a animação de nascer só
  começa no último quinto da espera — uma casca que racha desde o primeiro
  segundo não avisa nada.
- **A extinção.** O sistema da espécie declarava o fim quando a população
  chegava a zero — e passou a declará-lo no primeiro segundo de jogo, porque o
  jardim começa com um ovo e nenhuma criatura. Enquanto houver casca no chão, a
  espécie não acabou.

E o ovo é a primeira interação do jogo. Ele tem duas, e a diferença entre elas é
sobre quem o jogador já conhece:

- **O primeiro ovo nasce no toque.** Enquanto não há nenhuma criatura viva, o
  jardim inteiro é uma casca no chão — e pedir cinquenta segundos de mão parada
  antes que qualquer coisa aconteça é cobrar paciência de quem ainda não conhece
  ninguém ali dentro. O clique reescreve o relógio para sobrarem três segundos,
  que é a casca rachando na frente de quem clicou.
- **Os outros se chocam com a mão**, que os apressa em duas vezes e meia. Aí já
  há gente no jardim, e já existe motivo para esperar.

Nos dois casos, quem tirou a criatura da casca recebe de volta o afeto dela — a
primeira memória daquela criatura é você.

### A origem da espécie

O mundo começa com **uma criatura**, sem sexo, sem par e sem história. Estando
saudável, alimentada, tranquila e segura por tempo sustentado, ela se
**duplica** — e a cópia não é cópia: o genoma passa por mutação de um genitor
só, e daí saem cor, tamanho, metabolismo, coragem, curiosidade e velocidade
diferentes. Nesta fase, a mutação é a ÚNICA fonte de diversidade da espécie.

Quando a população cruza um limiar, a espécie **muda de fase**: aparecem machos
e fêmeas (alternados, nunca sorteados — um mundo que sorteia trinta sexos pode
dar 26 fêmeas e morrer por azar estatístico), o brotamento cessa e a reprodução
passa a exigir duas criaturas que se escolham.

A condição para brotar não é um relógio: é qualidade de vida **sustentada**, e
o progresso regride quando a vida piora. É isso que amarra a demografia ao
cuidado — o jardim cresce quando o jardim está bom. Medido em oito mundos de
trinta minutos: a primeira duplicação entre 58 e 283 segundos, seis mundos
chegando à transição, **dois extinguindo-se**. A fragilidade é intencional:
começar com uma criatura é aceitar que a espécie pode acabar, e o livro
registra o fim como registra tudo.

### O livro da história

Um diário que o mundo escreve sozinho: nasceu Luma, morreu Kiro, a primeira
duplicação, o primeiro casal, a décima geração. Não é telemetria — é o que
transforma uma população em uma HISTÓRIA. Uma morte anônima é um sprite a
menos; a morte de alguém que tem nome e passado é uma perda.

Duas regras o sustentam: **primeiras vezes são para sempre** (um evento marcado
como "primeira vez" só entra uma vez na vida do mundo) e **o livro nunca
descarta um marco** ao esquecer entradas antigas.

Na tela ele tem duas camadas, nenhuma delas um menu: o **sussurro** no canto,
que passa e some, e o **livro** inteiro, que só aparece quando o jogador aperta
`H`.

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
| — ✅  | O ovo: toda criatura nasce de uma casca, e a mão do jogador a choca          |
| — ✅  | Oito direções de caminhada a partir de cinco desenhos (as outras, espelhadas) |
| G ✅  | O cinto: oito ferramentas, o cursor vira o objeto, e nenhuma janela         |
| D ✅  | Vida social e ninhos: melhores amigas, desafetos, dormir junto, luto      |
| — ✅  | Comando de grupo: seleção por retângulo e ordens que podem ser recusadas  |
| — ✅  | Origem da espécie: um ancestral, brotamento com mutação, transição evolutiva |
| — ✅  | Livro da história: diário automático de nascimentos, mortes e marcos      |
| F ✅  | Linguagem: vocabulário de 10 palavras, computador de ensino, conhecimento que se espalha |
| E     | Som: voz sintetizada do genoma, chamados, risadas, choro de filhote       |

Critérios de aceitação da fase, verificados por teste:

- `garden.test.ts` roda o mundo por 30 minutos simulados em três seeds e cobra
  população viva e **ninguém sozinho**. Sem isso nenhuma história social
  acontece.
- `routines.test.ts` cobra que as histórias **cheguem ao fim** sozinhas: num
  jardim comum de 10 minutos, quantas correntes completas aconteceram sem o
  jogador tocar em nada.
- `language.test.ts` cobra que o ensino **aconteça sozinho** num mundo vivo: uma
  máquina no meio do jardim e criaturas com mais o que fazer. E cobra o preço —
  que uma palavra custe tempo, que não entre em criatura faminta, e que quem
  está de costas não aprenda nada.
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

### O cinto: o menu é o que está na sua mão

A regra do projeto sempre foi *a tela é do mundo*. O cinto de ferramentas é o
teste dessa regra, e a saída foi tratá-lo como um OBJETO e não como um painel:
oito ícones encostados na borda, e escolher um não abre nada, não pausa nada e
não pergunta nada — **o cursor vira aquele objeto**. Alimentar, dar banho, fazer
carinho e ensinar acontecem no jardim, com o mouse, em cima do bicho. Não existe
botão "alimentar".

Três consequências de projeto valem o registro:

- **A ferramenta é um estado só, e mora em `@core`.** A interface pinta o cinto,
  o navegador troca o cursor e a simulação decide o que um toque significa: os
  três precisam concordar sobre o que está na mão, e nenhum manda nos outros.
- **O mesmo gesto muda de sentido conforme o que se segura.** Apertar em cima de
  uma criatura é carinho com o coração na mão e banho com a esponja. Tocar o
  chão larga a bola, o presente ou o ovo. É o que faz cada ícone significar
  alguma coisa em vez de ser uma mão com enfeite diferente.
- **Mandar virou gesto de mão VAZIA.** Este foi um conflito real, achado no
  navegador: com uma criatura selecionada, todo toque no chão virava ordem de
  andar e as ferramentas não faziam nada — a bola não caía. As ordens do jogador
  passaram a valer só com a mão aberta; com um objeto na mão, o toque é o objeto.

A arte veio com os nomes dos arquivos trocados entre si (o próprio README chegou
como um `.png`). Cada um foi identificado pelo conteúdo e renomeado; a nota está
em `src/assets/ui/SPRITES.md`, para ninguém precisar redescobrir isso.

E a sujeira, que entrou com o banho, obrigou uma regra: **ela tem de sair
sozinha**. Sem uma saída natural — catar-se, tomar chuva — o jardim inteiro
ficaria encardido e infeliz para sempre a menos que o jogador passasse a esponja
em cada um, e o mundo tem de continuar vivo com ou sem alguém olhando. Foi um
teste de comportamento longo que apontou isso, ao mudar de resultado.

### Oito direções, cinco desenhos

O mundo é isométrico, então uma criatura pode ir para oito lados. A folha traz
**cinco**: sul (de frente — que é a folha inteira), sudeste, leste, nordeste e
norte. As quatro que faltam são o espelho horizontal das quatro da direita, e o
espelho sai de graça: o renderer já virava o sprite desde sempre.

Cinco em vez de oito não é economia de trabalho — é o que mantém a arte
coerente. Oito conjuntos desenhados à mão divergem entre si, e o olho pega na
hora que a criatura mudou de tamanho ao virar.

A armadilha do sistema está na projeção, e o teste existe por causa dela:
**andar para o leste do mundo não é andar para a direita da tela**. Um passo em
`+x` desce pela direita; um em `+y` desce pela esquerda; o "para a direita" que
o jogador vê é `+x` e `-y` ao mesmo tempo. Quem escolhe o desenho raciocina em
coordenadas de TELA — quem projeta é o renderer, e o módulo da folha não sabe o
que é isometria.

Uma regra de prioridade fecha o desenho: **andando, manda o rumo; parada, manda
o resto** — humor, gesto, o que ela carrega. É de frente que ela tem rosto, e é
o rosto que conta o que ela sente; uma criatura que para de andar e se vira para
quem olha não é um artifício de arte, é o que um bicho faz.

### O que cobre a tela não pertence ao mundo

A contrapartida da vista isométrica, aprendida com um defeito que só aparecia à
noite: **a escuridão da noite era um retângulo desenhado de (0,0) até (largura,
altura) do mundo**, em coordenadas não projetadas. Depois da projeção, o que se
vê é um losango que vai de `-altura` a `+largura` no eixo X — e aquele retângulo
passou a cobrir um pedaço torto da tela. Metade do jardim anoitecia; a outra
metade ficava em pleno dia; entre as duas, uma linha reta vertical.

A regra que saiu daí: o que existe **num lugar** do mundo (uma poça, uma sombra)
se desenha em coordenadas do mundo; o que **cobre a tela** (a noite, a chuva) se
desenha na VISTA — o retângulo que a câmera enxerga, recalculado por quadro a
partir do zoom e do centro. Assim continua certo em qualquer zoom e em qualquer
canto para onde a câmera vá.

Pela mesma razão, as gotas de chuva deixaram de nascer num quadrado do mapa e
passam a cair na frente da câmera, e o arco-íris nasce no centro PROJETADO do
jardim. Medido depois da correção: ao meio-dia com chuva a tela escurece 28%; à
meia-noite, 54% — uniformemente, sem costura.

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

### A vida social sai da memória, não de um sistema novo

O grafo social já existia — espalhado dentro da memória associativa. Toda vez
que duas criaturas brincam, dividem uma fruta ou brigam, uma grava uma opinião
sobre a outra. A etapa D não inventou relacionamento nenhum: ela **lê** esse
grafo (`Bond`, atualizado a cada três segundos) e deixa o mundo agir sobre ele.

O **ninho** (`Nest`) segue a mesma ideia: não é construção nem objeto, é um
LUGAR escolhido pelo uso. A criatura dorme onde se sente segura e o ninho anda
devagar até ali; quem tem uma melhor amiga puxa o próprio ninho na direção do
dela. É só disso que nascem as famílias dormindo juntas — em nenhum lugar está
escrito "durmam em grupo". Medido em vinte minutos: ninhos de amigas a **52px**
de distância, contra **235px** de um par qualquer do jardim.

O **luto** é o único acontecimento do jogo que produz uma tristeza que não vem
de uma necessidade: não dá para comer nem beber para curá-la. Quem tinha laço
com quem morreu fica triste, guarda a lembrança e vai até onde aconteceu.

Critério de aceitação (`social.test.ts`): o que se cobra não é que os laços
EXISTAM — isso é só um número —, é que apareçam no comportamento. Com quem ela
anda, onde ela dorme, e o que acontece com quem fica.

### Ordens do jogador, e por que a criatura pode recusar

Selecionar um grupo com um retângulo e mandá-lo andar até um ponto entra em
tensão direta com a regra principal do projeto: *a criatura nunca pode parecer
um NPC esperando ordens*.

A saída não foi enfraquecer o comando — foi dar a ele um **custo**. A criatura
decide se obedece:

- quem confia em você vai, e sai um pouco mais próxima de você por ter ido;
- quem tem medo de você **não vai**;
- quem está morrendo de fome, de sede ou de dor não vai, porque tem problema
  próprio — exatamente como já acontecia com as rotinas.

Com isso a desobediência deixa de ser um defeito e vira **informação**: é o
jeito mais direto de descobrir que aquela ali ainda não confia em você. A ordem
também tem prazo (22 segundos) e é largada quando a urgência chega, o que
impede uma criatura de morrer perseguindo um ponto impossível.

Mecanicamente, `Order` é irmã de `Plan`: roda antes da decisão, impõe intenção
e alvo e segura o compromisso alto para o cérebro não interferir. A diferença é
de ORIGEM, não de mecanismo — uma nasce da própria criatura, a outra da sua mão.

Do lado do desenho, o retângulo de seleção é comparado em espaço **projetado**:
na tela ele é alinhado aos eixos, mas no mundo isométrico seria um losango, e a
varredura pegaria criaturas que o jogador não viu dentro da caixa.

### A linguagem, e por que ela não é enfeite

Uma criatura que aprende a dizer "água" não ganhou um adorno de ficha: ganhou
um jeito de guardar o mundo na cabeça sem ter o mundo na frente. Por isso cada
palavra do vocabulário **faz alguma coisa**:

- quem sabe `água` alcança o lago de muito mais longe (o termo de lembrança da
  sede ganha +260) — deixa de reagir à sede e passa a se antecipar a ela;
- quem sabe `fruta` repara em comida a 35% mais distância;
- e a palavra **carrega conhecimento junto**. Quando duas criaturas
  compartilham `fruta`, quem sabe que certo fruto faz mal passa o aviso adiante;
  com `perigo`, passa-se o lugar onde algo ruim aconteceu; com `você`, passa-se
  a OPINIÃO sobre o jogador. Uma criatura que nunca provou o cogumelo venenoso
  pode recusá-lo porque alguém lhe contou, e a sua reputação corre o jardim sem
  você encostar em ninguém.

O ensino tem três caminhos, e todos passam pela mesma porta (`teachWord`):

1. **O computador** — a única coisa artificial do jardim. Ocupa uma casa do
   tabuleiro como uma árvore, e por isso se arrasta: onde o jogador o põe decide
   quem aprende a falar. A tela acende quando alguém está diante dela e mostra
   uma palavra por vez.
2. **Você** — segurar uma fruta diante de uma criatura **que está olhando** é
   nomear a fruta para ela. Mostrar algo para quem está de costas não ensina
   nada, e é isso que faz ensinar ser uma relação e não um botão.
3. **Elas** — quem sabe uma palavra a repete para quem está por perto, e assim o
   conhecimento deixa de ser de um indivíduo e passa a ser da espécie. Filhotes
   herdam metade do que os pais sabiam dizer, sempre abaixo do que eles sabiam:
   nascem com o começo da língua da família e precisam terminar de aprendê-la.

Aprender exige estar **bem** — sem fome, sem sede, sem medo, sem dor. Cuidar é
pré-requisito de ensinar, e essa dependência é o que amarra a linguagem ao resto
do jogo.

Duas medições valem ficar registradas, porque as duas primeiras versões do
sistema **não aprendiam nada**:

- **O esquecimento não pode ser mais rápido que os intervalos da vida.** Com
  0,004/s, a criatura estudava um pouco, saía para comer e voltava tendo perdido
  o caminho andado: 25 mil lições dadas em vinte e cinco minutos, **zero
  palavras aprendidas**. Passou a 0,0008/s, da ordem do esquecimento da memória
  associativa.
- **Ensinar é insistir.** A máquina mostrava sempre a palavra menos sabida, o
  que parecia justo e era desastroso: espalhava um pouquinho de dez palavras por
  todas as cabeças e nenhuma chegava perto de virar conhecimento. Agora ela
  TERMINA o que começou — a tela não muda enquanto a turma presente não dominar
  a palavra atual.

Com isso, medido: em quinze minutos de jardim sem nenhuma interferência, **12 de
35 criaturas falam**, uma delas com o vocabulário inteiro; e num mundo SEM
computador, onde a única fonte de palavras é uma criatura que já sabe, duas
outras aprenderam ouvindo — e souberam da fruta ruim sem nunca terem provado.

### A música e a política de autoplay

Qualquer áudio largado em `src/assets/audio/` vira música de fundo, sem tocar em
código: o módulo varre a pasta e monta a lista. Um arquivo só toca em círculo;
vários viram uma lista que dá a volta. `M` liga e desliga.

Duas coisas que só aparecem no navegador de verdade e por isso ficam anotadas:

- **Nenhum navegador toca som antes de um gesto.** Um `play()` na abertura da
  página falha em silêncio — sem erro visível, sem música nunca. O player trata
  essa falha como o caso NORMAL e fica de tocaia no primeiro clique ou tecla,
  que num jogo feito de cliques chega em segundos.
- **Temporizador não é relógio.** A entrada suave contava um trigésimo por
  disparo de `setInterval`; com a página ocupada a sessenta quadros por segundo,
  o disparo vinha a cada 120 ms em vez de 33. Medido: 2,5 s de fade viravam mais
  de 9, e apertar `M` deixava a música tocando baixinho por vários segundos. O
  tempo passou a ser lido de `performance.now()`.

### A palavra que sai pela boca

Duas regras fazem o vocabulário aparecer na tela, e as duas existem pelo mesmo
motivo: **aprendizado invisível é aprendizado que não aconteceu** para quem
joga.

- **Toda palavra que entra sai pela boca na hora.** O instante em que uma
  criatura passa a saber "água" é o mais importante do sistema — e sem a bolha
  ele seria um número subindo em silêncio.
- **E ela diz o que está fazendo.** Quem sabe "água" e resolve beber DIZ "água";
  quem sabe "perigo" e foge, diz "perigo". É aqui que o vocabulário deixa de ser
  uma lista na ficha e vira comportamento visível: o jogador vê a palavra que
  ensinou saindo da boca dela no momento em que ela serve para alguma coisa.
  Só na TROCA de intenção, e com um intervalo de nove segundos — repetir "água"
  durante a caminhada inteira até o lago viraria um zumbido.

### Dormir é ir para casa

Ficou registrado porque foi um defeito que ninguém via. A criatura escolhia
dormir, o ninho era posto como alvo — e a primeira linha do trecho de movimento
zerava a velocidade na hora. Ela caía no sono a duzentos pixels da própria cama,
e o ninho não servia para nada. Agora ela **anda até em casa**, devagar, como
quem já está com sono: dormir no próprio ninho subiu de 56% para 62% das
amostras, e é o que faz as famílias aparecerem dormindo juntas.

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
  dentro do lago, nunca encostado noutra peça. Vale também para o computador:
  encostado numa árvore ele viraria parede, e ainda por cima uma parede onde as
  criaturas precisam parar para ler.

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

### O que a filosofia ainda cobra

Registrado aqui para não se perder, na ordem em que muda mais a experiência:

- **Personalidade que muda com a experiência.** Hoje os traços são fixos desde o
  nascimento; deveriam derivar lentamente conforme o que a criatura vive.
- **Emoções que faltam**: vergonha, ansiedade, amor, ciúmes, nojo.
- **Estações do ano.** Há dia/noite e chuva; falta o ano inteiro.
- **Genoma maior.** São ~20 genes; a filosofia pede centenas, e nenhum
  puramente cosmético.
- **Carregar no colo** e o cursor mudando por gesto (mão aberta, fechada,
  carinho, empurrão, apontar).
- **Save/Load** (`src/save/` ainda vazio): um mundo que conta histórias por
  centenas de horas precisa sobreviver a fechar a aba.

### Rumo à v1.0

- GOAP (planejamento orientado a objetivos) sobre a camada de rotinas.
- Redes neurais simples + Algoritmo Genético (o cérebro passa a evoluir no DNA).
- Performance: simulação em Web Worker, pooling e spatial partitioning endurecidos.
- Save/Load em IndexedDB (`src/save/` ainda vazio).

## 6. Forma de trabalho

Desenvolvimento por etapas. Cada etapa passa por: planejamento → explicação →
código → revisão → refatoração, e só avança após aprovação.
