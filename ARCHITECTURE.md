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
| **rendering**  | Adapter PixiJS: desenha o snapshot, câmera, interpolação, pooling de sprites     | core, engine                       |
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

### Invariantes de geração do mundo

O jardim é sorteado, mas não pode sortear um mundo inviável. A geração
**verifica**, em vez de confiar em distâncias mágicas:

- **Piso de água** (`terrain.ts`): sem lago suficiente a população morre de sede.
- **Nenhuma pedra corta o jardim** (`connectivity.ts`): pôr uma pedra grande só
  pode consumir a área dela mesma; se desconectasse um pedaço, ela não vai ali.
  Encurralar continua possível — mas só com as mãos de quem joga.
- **Ninguém nasce em ilha** (`spawnCreatures`): criaturas só surgem na maior
  região contínua.

### Rumo à v1.0

- GOAP (planejamento orientado a objetivos) sobre a camada de rotinas.
- Redes neurais simples + Algoritmo Genético (o cérebro passa a evoluir no DNA).
- Performance: simulação em Web Worker, pooling e spatial partitioning endurecidos.
- Save/Load em IndexedDB (`src/save/` ainda vazio).

## 6. Forma de trabalho

Desenvolvimento por etapas. Cada etapa passa por: planejamento → explicação →
código → revisão → refatoração, e só avança após aprovação.
