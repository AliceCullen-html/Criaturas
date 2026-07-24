# Criaturas

Simulação de vida artificial no navegador — um sucessor espiritual moderno de
_Creatures_ (1996). Criaturas vivem em um ecossistema, têm DNA, evoluem
geneticamente e sobrevivem de forma emergente.

> **Status:** Etapa 0 — Scaffold. Fundação do projeto pronta; o motor de
> simulação começa na Etapa 1. Veja o roadmap em [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Stack

React · TypeScript · Vite · PixiJS · Zustand · IndexedDB (idb) · pnpm ·
ESLint · Prettier.

## Arquitetura

Clean Architecture + ECS (Entity-Component-System) + loop de simulação com
timestep fixo e determinístico. A simulação roda em estruturas puras, **fora**
do React; o Zustand cuida apenas do estado de UI. Detalhes completos em
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

```
src/
├── core/        Kernel puro (math, RNG, ECS utils, spatial, eventos)
├── engine/      Núcleo ECS + loop de timestep fixo
├── world/       Terreno, recursos, clima, dia/noite, estações
├── creatures/   Componentes e blueprint das criaturas
├── genetics/    Genoma, genótipo->fenótipo, cruzamento, mutação
├── ai/          Cérebros plugáveis (FSM -> BT -> GOAP -> NN -> GA)
├── simulation/  Sistemas que aplicam as regras a cada tick
├── rendering/   Adapter PixiJS (somente leitura)
├── ui/          React + Zustand (HUD, painéis)
├── save/        Persistência IndexedDB
├── app/         Composition root
└── assets/      Sprites, paletas, dados estáticos
```

## Scripts

```bash
pnpm install      # instala dependências
pnpm dev          # servidor de desenvolvimento
pnpm build        # typecheck + build de produção
pnpm preview      # pré-visualiza o build
pnpm lint         # ESLint (inclui regra de fronteiras entre camadas)
pnpm format       # Prettier
pnpm typecheck    # checagem de tipos
```

## Requisitos

Node >= 20 e pnpm. A versão de Node recomendada está em [`.nvmrc`](./.nvmrc).
