import type { HandState } from './textures/hand';

/**
 * Reconhecimento de gestos do mouse.
 *
 * Traduz eventos crus (posição, botão, tempo) em **intenções físicas** —
 * afagar, pegar, arremessar, gesto brusco. A simulação nunca vê um "clique":
 * ela recebe o significado. Isso mantém a fronteira input → jogo limpa.
 */

export interface GestureHandlers {
  /** Clique simples sobre uma criatura ou objeto (ou vazio → limpa seleção). */
  onSelect: (creatureId: number | null) => void;
  /** Segurou sobre um objeto: pegou. */
  onGrab: (itemId: number) => void;
  /** Movendo o objeto na mão. */
  onDragHeld: (itemId: number, x: number, y: number) => void;
  /** Soltou o objeto (com velocidade do gesto → arremesso). */
  onRelease: (itemId: number, x: number, y: number, vx: number, vy: number) => void;
  /** Movimento lento segurando sobre a criatura: carinho. */
  onPet: (creatureId: number, dt: number) => void;
  /** Carinho prolongado o bastante para virar lembrança. */
  onPetRemembered: (creatureId: number) => void;
  /** Gesto rápido sobre a criatura: empurrão/agressão. */
  onRough: (creatureId: number, speed: number, dirX: number, dirY: number) => void;
  /** Duplo clique perto da criatura: chama a atenção. */
  onCall: (creatureId: number) => void;
  /** Clique longo parado sobre a criatura: modo observação. */
  onObserve: (creatureId: number) => void;
  /** Objeto na mão encostou numa criatura: oferece. */
  onOffer: (itemId: number, creatureId: number) => void;
  /** Posição da mão no mundo. */
  onHandMove: (x: number, y: number, inside: boolean) => void;
  /** Clique numa árvore/pedra/arbusto do cenário. */
  onPokeScenery: (kind: string, index: number) => void;
  /** Segurou e arrastou uma peça do cenário: ela saiu do chão. */
  onGrabScenery: (index: number) => void;
  /** A peça do cenário acompanha a mão. */
  onDragScenery: (index: number, x: number, y: number) => void;
  /** Largou a peça: ela procura uma casa livre onde pousar. */
  onDropScenery: (index: number, x: number, y: number) => void;
  /** Clique no chão: sacode a vegetação dali. */
  onPokeGround: (x: number, y: number) => void;
  /** Clique na água: ondas e peixes fugindo. */
  onPokeWater: (x: number, y: number) => void;

  // --- Comando de grupo ---------------------------------------------------
  /** Arrastando um retângulo de seleção no chão (cantos em coordenadas de mundo). */
  onMarquee: (x1: number, y1: number, x2: number, y2: number) => void;
  /** Soltou o retângulo: seleciona quem estiver dentro. */
  onMarqueeEnd: (x1: number, y1: number, x2: number, y2: number) => void;
  /** Ordem no ponto (botão direito, ou toque com alguém já selecionado). */
  onOrder: (x: number, y: number) => void;
}

export interface WorldProbe {
  creatureAt: (x: number, y: number) => number | null;
  /** Há alguém selecionado agora? Decide se um toque no chão é ordem ou cutucão. */
  hasSelection: () => boolean;
  itemAt: (x: number, y: number) => number | null;
  /** Cenário grande sob o ponto: árvore, pedra ou arbusto. */
  sceneryAt: (x: number, y: number) => { kind: string; index: number } | null;
  isWater: (x: number, y: number) => boolean;
}

const DOUBLE_CLICK_MS = 320;
/** Segundos de dedo parado para um objeto solto vir na mão. */
const HOLD_ITEM = 0.18;
/**
 * Segundos de dedo parado para o cenário ceder.
 *
 * Arrancar uma árvore custa mais que pegar uma fruta: ela é pesada, e o toque
 * nela já significava outra coisa — sacudir. Se saísse do chão no mesmo tempo
 * de uma maçã, ninguém conseguiria mais sacudir uma árvore sem levá-la junto.
 */
const HOLD_LIFT = 0.45;
const OBSERVE_MS = 700;
const PET_SPEED_MAX = 260; // px/s no mundo: acima disso não é carinho
const ROUGH_SPEED = 620;
const PET_TIME_FOR_MEMORY = 2.2;
const DRAG_THRESHOLD = 4;
/** Piso do intervalo entre amostras, para não inflar a velocidade. */
const MIN_SAMPLE_DT = 0.016;
const SPEED_SMOOTHING = 0.55;
/** Um gesto brusco precisa percorrer distância de verdade, não só ser rápido. */
const ROUGH_MIN_TRAVEL = 30;

export class GestureRecognizer {
  private down = false;
  private downTime = 0;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastMoveTime = 0;
  private speed = 0;
  private velX = 0;
  private velY = 0;
  private moved = false;

  private heldItem: number | null = null;
  /**
   * Peça do cenário na mão. Separada de `heldItem` de propósito: um objeto é
   * uma entidade do mundo e pode ser arremessado ou oferecido; uma árvore é
   * mobília, e a única coisa que se faz com ela é pousá-la noutra casa.
   */
  private heldScenery: number | null = null;
  /** Segundos de dedo apoiado, e o que está embaixo dele. */
  private holdTime = 0;
  private holdTarget: { kind: 'item' | 'scenery'; index: number } | null = null;
  /**
   * Retângulo de seleção em curso.
   *
   * Só nasce quando o arrasto começou em chão VAZIO — sem objeto, sem criatura
   * e sem cenário embaixo. É o que deixa a seleção conviver com o resto dos
   * gestos sem roubar nenhum deles: onde havia algo para pegar, pega-se; onde
   * não havia nada, varre-se.
   */
  private marquee = false;
  private pettingId: number | null = null;
  private petTime = 0;
  private petRemembered = false;
  private roughSent = false;
  private observed = false;
  private lastClickTime = 0;
  private lastClickX = 0;
  private lastClickY = 0;

  private state: HandState = 'open';
  private dropAnim = 0;

  constructor(
    private readonly handlers: GestureHandlers,
    private readonly probe: WorldProbe,
  ) {}

  get handState(): HandState {
    return this.state;
  }

  get carrying(): number | null {
    return this.heldItem;
  }

  /**
   * O quanto falta para o que está sob o dedo ceder, de 0 a 1.
   *
   * O renderer usa isto para fazer a peça TREMER enquanto solta. Sem esse
   * aviso, segurar uma árvore é um segundo de nada acontecendo, e o jogador
   * larga antes de descobrir que dava.
   */
  get liftProgress(): number {
    if (!this.down || this.heldScenery !== null || this.heldItem !== null) return 0;
    if (this.pettingId !== null || this.holdTarget === null) return 0;
    return Math.min(1, this.holdTime / (this.holdTarget.kind === 'item' ? HOLD_ITEM : HOLD_LIFT));
  }

  /** O que vai ceder se o dedo continuar parado ali. */
  get liftIndex(): number | null {
    return this.liftProgress > 0 && this.holdTarget?.kind === 'scenery'
      ? this.holdTarget.index
      : null;
  }

  /** Chamado a cada quadro para animações e carinho contínuo. */
  tick(dt: number): void {
    if (this.dropAnim > 0) {
      this.dropAnim -= dt;
      if (this.dropAnim <= 0 && this.state === 'dropping') this.state = 'open';
    }

    // Segurar parado também pega.
    //
    // Antes só o MOVIMENTO disparava a pegada: era preciso apertar e arrastar
    // no mesmo gesto, e quem apertava e esperava — que é o que todo mundo faz
    // num celular — não conseguia levantar nada. Agora o tempo conta sozinho,
    // e o dedo pode ficar quieto.
    if (this.down && this.heldItem === null && this.heldScenery === null) {
      this.holdTime += dt;
      if (this.holdTarget === null && this.pettingId === null) {
        const item = this.probe.itemAt(this.downX, this.downY);
        if (item !== null) this.holdTarget = { kind: 'item', index: item };
        else {
          const piece = this.probe.sceneryAt(this.downX, this.downY);
          if (piece) this.holdTarget = { kind: 'scenery', index: piece.index };
        }
      }
      const target = this.holdTarget;
      if (target && this.pettingId === null) {
        const needed = target.kind === 'item' ? HOLD_ITEM : HOLD_LIFT;
        if (this.holdTime >= needed) {
          if (target.kind === 'item') {
            this.heldItem = target.index;
            this.handlers.onGrab(target.index);
          } else {
            this.heldScenery = target.index;
            this.handlers.onGrabScenery(target.index);
          }
          this.state = 'holding';
        }
      }
    }

    if (this.pettingId !== null && this.down) {
      this.petTime += dt;
      this.handlers.onPet(this.pettingId, dt);
      if (!this.petRemembered && this.petTime >= PET_TIME_FOR_MEMORY) {
        this.petRemembered = true;
        this.handlers.onPetRemembered(this.pettingId);
      }
    }

    // Sem movimento recente, a velocidade decai (evita gesto "preso").
    this.speed *= Math.max(0, 1 - dt * 6);
  }

  pointerDown(x: number, y: number, time: number, button: number): void {
    if (button !== 0) return;
    this.down = true;
    this.downTime = time;
    this.downX = x;
    this.downY = y;
    this.lastX = x;
    this.lastY = y;
    this.lastMoveTime = time;
    this.moved = false;
    this.velX = 0;
    this.velY = 0;
    this.speed = 0;
    this.roughSent = false;
    this.observed = false;
    this.petTime = 0;
    this.petRemembered = false;
    this.holdTime = 0;
    this.holdTarget = null;

    // Duplo clique perto de uma criatura chama sua atenção.
    const creature = this.probe.creatureAt(x, y);
    if (
      creature !== null &&
      time - this.lastClickTime < DOUBLE_CLICK_MS &&
      Math.hypot(x - this.lastClickX, y - this.lastClickY) < 24
    ) {
      this.handlers.onCall(creature);
      this.lastClickTime = 0;
      return;
    }
    this.lastClickTime = time;
    this.lastClickX = x;
    this.lastClickY = y;

    if (creature !== null) this.pettingId = creature;
  }

  /** Botão direito: ordem para quem estiver selecionado. */
  secondaryDown(x: number, y: number): void {
    this.handlers.onOrder(x, y);
  }

  pointerMove(x: number, y: number, time: number): void {
    // O dt real entre dois eventos pode ser de 1 ms, o que faria um tremor de
    // 3 px virar "3000 px/s". Um piso de dt e uma média móvel evitam que um
    // deslize suave seja confundido com um gesto violento.
    const dt = Math.max((time - this.lastMoveTime) / 1000, MIN_SAMPLE_DT);
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const instantX = dx / dt;
    const instantY = dy / dt;
    this.velX = this.velX * SPEED_SMOOTHING + instantX * (1 - SPEED_SMOOTHING);
    this.velY = this.velY * SPEED_SMOOTHING + instantY * (1 - SPEED_SMOOTHING);
    this.speed = Math.hypot(this.velX, this.velY);
    this.lastX = x;
    this.lastY = y;
    this.lastMoveTime = time;

    this.handlers.onHandMove(x, y, true);

    if (!this.down) {
      // A mão avisa o que está sob ela: fecha os dedos sobre qualquer coisa
      // com que dê para interagir. Sem esse aviso o jogador não descobre onde
      // pode tocar — e um jogo que é só gesto vira um jogo sem alvos.
      if (this.heldItem === null && this.dropAnim <= 0) {
        const alvo =
          this.probe.itemAt(x, y) !== null ||
          this.probe.creatureAt(x, y) !== null ||
          this.probe.sceneryAt(x, y) !== null;
        this.state = alvo ? 'closing' : 'open';
      }
      return;
    }

    if (Math.hypot(x - this.downX, y - this.downY) > DRAG_THRESHOLD) this.moved = true;

    // Varredura: arrastar a partir de chão vazio desenha o retângulo.
    if (this.marquee || (this.moved && this.holdTarget === null && this.pettingId === null)) {
      const empty =
        this.probe.itemAt(this.downX, this.downY) === null &&
        this.probe.creatureAt(this.downX, this.downY) === null &&
        this.probe.sceneryAt(this.downX, this.downY) === null;
      if (this.marquee || empty) {
        this.marquee = true;
        this.state = 'open';
        this.handlers.onMarquee(this.downX, this.downY, x, y);
        return;
      }
    }

    // Já carregando cenário: a árvore ou pedra acompanha a mão.
    if (this.heldScenery !== null) {
      this.state = 'holding';
      this.handlers.onDragScenery(this.heldScenery, x, y);
      return;
    }

    // Já carregando: o objeto acompanha a mão.
    if (this.heldItem !== null) {
      this.state = 'holding';
      this.handlers.onDragHeld(this.heldItem, x, y);
      const creature = this.probe.creatureAt(x, y);
      if (creature !== null) this.handlers.onOffer(this.heldItem, creature);
      return;
    }

    // Sobre uma criatura: lento = carinho, rápido e longe = agressão.
    if (this.pettingId !== null) {
      const travel = Math.hypot(x - this.downX, y - this.downY);
      if (this.speed > ROUGH_SPEED && travel > ROUGH_MIN_TRAVEL && !this.roughSent) {
        this.roughSent = true;
        this.state = 'rough';
        this.handlers.onRough(this.pettingId, this.speed, this.velX, this.velY);
        this.pettingId = null;
      } else if (this.speed < PET_SPEED_MAX) {
        // Deixou de estar sobre a criatura: o carinho acaba.
        if (this.probe.creatureAt(x, y) !== this.pettingId) {
          this.pettingId = null;
          this.state = 'open';
        } else {
          this.state = 'petting';
        }
      }
      return;
    }

    // Pegar é assunto de `tick`: o relógio corre com o dedo parado ou andando,
    // e é ele que decide. Aqui só sobrou a mão mostrando o que vai acontecer.
    if (this.holdTarget !== null) this.state = 'closing';
  }

  pointerUp(x: number, y: number, time: number, button: number): void {
    if (button !== 0) return;

    if (this.marquee) {
      this.handlers.onMarqueeEnd(this.downX, this.downY, x, y);
      this.marquee = false;
      this.state = 'open';
    } else if (this.heldScenery !== null) {
      this.handlers.onDropScenery(this.heldScenery, x, y);
      this.heldScenery = null;
      this.state = 'dropping';
      this.dropAnim = 0.25;
    } else if (this.heldItem !== null) {
      this.handlers.onRelease(this.heldItem, x, y, this.velX, this.velY);
      this.heldItem = null;
      this.state = 'dropping';
      this.dropAnim = 0.25;
    } else if (!this.moved) {
      const heldMs = time - this.downTime;
      const creature = this.probe.creatureAt(x, y);
      if (creature !== null && heldMs > OBSERVE_MS && !this.observed) {
        this.observed = true;
        this.handlers.onObserve(creature);
      }
      if (creature !== null) {
        this.handlers.onSelect(creature);
        this.state = 'open';
        this.down = false;
        this.pettingId = null;
        this.petTime = 0;
        return;
      }

      // Com um grupo selecionado, tocar o mundo é MANDAR. É o que faz o
      // comando funcionar no celular, onde não existe botão direito.
      if (this.probe.hasSelection()) {
        this.handlers.onOrder(x, y);
        this.state = 'open';
        this.down = false;
        this.holdTime = 0;
        this.holdTarget = null;
        return;
      }

      // Clique fora de uma criatura age sobre o mundo, não sobre menus.
      const scenery = this.probe.sceneryAt(x, y);
      if (scenery) this.handlers.onPokeScenery(scenery.kind, scenery.index);
      else if (this.probe.isWater(x, y)) this.handlers.onPokeWater(x, y);
      else this.handlers.onPokeGround(x, y);
      this.handlers.onSelect(null);
      this.state = 'open';
    } else {
      this.state = 'open';
    }

    this.down = false;
    this.marquee = false;
    this.pettingId = null;
    this.petTime = 0;
    this.holdTime = 0;
    this.holdTarget = null;
  }

  pointerLeave(): void {
    // Sair da tela carregando uma árvore a pousaria em lugar nenhum: ela é
    // largada onde o cursor passou por último, e a casa decide o resto.
    if (this.heldScenery !== null) {
      this.handlers.onDropScenery(this.heldScenery, this.lastX, this.lastY);
      this.heldScenery = null;
    }
    this.down = false;
    this.pettingId = null;
    this.state = 'open';
    this.holdTime = 0;
    this.holdTarget = null;
    this.handlers.onHandMove(0, 0, false);
  }

  /**
   * Aborta o gesto em curso sem concluí-lo.
   *
   * Usado quando um segundo dedo encosta na tela: aquilo virou câmera, não
   * gesto. O que estava na mão é POUSADO onde está — nunca arremessado, senão
   * pinçar para dar zoom jogaria a fruta longe.
   */
  cancel(): void {
    if (this.heldItem !== null) {
      this.handlers.onRelease(this.heldItem, this.lastX, this.lastY, 0, 0);
      this.heldItem = null;
    }
    // A árvore também é pousada, não abandonada no ar: o segundo dedo vira
    // câmera, e o que estava na mão precisa terminar em algum lugar.
    if (this.heldScenery !== null) {
      this.handlers.onDropScenery(this.heldScenery, this.lastX, this.lastY);
      this.heldScenery = null;
    }
    this.down = false;
    this.moved = false;
    this.marquee = false;
    this.holdTime = 0;
    this.holdTarget = null;
    this.pettingId = null;
    this.petTime = 0;
    this.speed = 0;
    this.velX = 0;
    this.velY = 0;
    this.state = 'open';
    this.handlers.onHandMove(0, 0, false);
  }
}
