/**
 * A MÚSICA DE FUNDO.
 *
 * Um jardim em silêncio é um programa rodando; o mesmo jardim com uma música
 * atrás é um lugar. É só isso que este módulo faz — e faz de um jeito que não
 * exige nada de quem joga: nenhum botão de tocar, nenhum menu de volume.
 *
 * Três decisões valem o registro, porque as três vêm de como os navegadores e
 * as pessoas realmente se comportam:
 *
 * - **O navegador não deixa tocar antes de um gesto.** Chrome, Safari e Firefox
 *   bloqueiam áudio automático em página que ninguém tocou ainda. Se o código
 *   se limitasse a chamar `play()`, a música simplesmente nunca começaria, sem
 *   erro nenhum visível. Por isso a falha é ESPERADA aqui: quando ela acontece,
 *   o player fica de tocaia no primeiro clique ou tecla e começa ali.
 * - **Ela entra devagar.** Um som que estoura em volume cheio no instante em
 *   que a página abre assusta. São dois segundos e meio subindo do silêncio.
 * - **Aba escondida, música pausada.** Ninguém quer procurar de qual das vinte
 *   abas está vindo o som.
 *
 * O arquivo não é escolhido pelo nome: qualquer áudio na pasta de músicas entra
 * na lista. É o que faz "arrastei a música para a pasta" ser tudo o que o autor
 * do jogo precisa fazer.
 */

/**
 * As faixas encontradas no projeto, em ordem de nome.
 *
 * O lugar certo é `src/assets/audio/`, mas `src/` também é varrido: é onde a
 * mão vai primeiro quando se arrasta um arquivo para dentro do projeto, e um
 * jogo que fica mudo porque a pasta era outra não ajuda ninguém.
 */
const found: Record<string, string> = {
  ...import.meta.glob('/src/assets/audio/**/*.{mp3,ogg,wav,m4a}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
  ...import.meta.glob('/src/*.{mp3,ogg,wav,m4a}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
};

const TRACKS: string[] = Object.keys(found)
  .sort()
  .map((path) => found[path]!);

/** Volume de repouso. Música de fundo é fundo: fica abaixo do jogo. */
const VOLUME = 0.34;
/** Segundos que ela leva para surgir do silêncio. */
const FADE_IN = 2.5;
/** Segundos do corte suave ao mudar de estado (mudo, aba escondida). */
const FADE = 0.5;

export interface Music {
  /** Começa a tocar — ou fica esperando o primeiro gesto, se o navegador barrar. */
  start(): void;
  /** Liga/desliga o som. Devolve `true` se ficou MUDO. */
  toggleMute(): boolean;
  readonly muted: boolean;
  /** Há alguma faixa no projeto? */
  readonly hasTrack: boolean;
  dispose(): void;
}

export function createMusic(): Music {
  let track = 0;
  let muted = false;
  let unlocking = false;
  let fade = 0;
  let element: HTMLAudioElement | null = null;

  if (TRACKS.length > 0) {
    element = new Audio(TRACKS[0]!);
    element.preload = 'auto';
    // Uma faixa só toca em círculo; várias viram uma lista que dá a volta.
    element.loop = TRACKS.length === 1;
    element.volume = 0;
    // Preso ao documento de propósito: alguns navegadores tratam melhor um
    // elemento que está na página, e assim ele também aparece nas ferramentas
    // de quem for depurar o som algum dia.
    element.style.display = 'none';
    document.body.appendChild(element);
  }

  const audio = element;

  /**
   * Leva o volume até `target` em `seconds`.
   *
   * O tempo é medido no relógio, não contado em tiques. A primeira versão
   * somava um trigésimo a cada disparo do intervalo — e como o navegador atrasa
   * temporizadores em página ocupada (e o jogo ocupa a página inteira, sessenta
   * quadros por segundo), o disparo vinha a cada 120 ms em vez de 33 ms. Medido:
   * uma entrada de 2,5 s levava mais de 9 segundos, e apertar `M` deixava a
   * música tocando baixinho por vários segundos antes de calar.
   */
  const rampTo = (target: number, seconds: number): void => {
    if (!audio) return;
    window.clearInterval(fade);
    const from = audio.volume;
    const started = performance.now();
    fade = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / (seconds * 1000));
      audio.volume = from + (target - from) * t;
      if (t >= 1) {
        window.clearInterval(fade);
        fade = 0;
        if (target === 0) audio.pause();
      }
    }, 33);
  };

  /** Toca a próxima faixa da lista (só existe com mais de uma). */
  const next = (): void => {
    if (!audio || TRACKS.length < 2) return;
    track = (track + 1) % TRACKS.length;
    audio.src = TRACKS[track]!;
    void audio.play().catch(() => undefined);
  };

  /**
   * O primeiro gesto do jogador destrava o áudio.
   *
   * Fica registrado UMA vez e se remove sozinho ao dar certo — deixar ouvintes
   * de `pointerdown` pendurados na janela de um jogo que é todo feito de
   * cliques seria pagar por nada em cada toque.
   */
  const unlock = (): void => {
    if (!audio) return;
    void audio
      .play()
      .then(() => {
        unlocking = false;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        if (!muted) rampTo(VOLUME, FADE_IN);
      })
      .catch(() => undefined);
  };

  const onVisibility = (): void => {
    if (!audio || muted) return;
    if (document.hidden) rampTo(0, FADE);
    else {
      void audio.play().catch(() => undefined);
      rampTo(VOLUME, FADE);
    }
  };

  document.addEventListener('visibilitychange', onVisibility);

  return {
    get muted() {
      return muted;
    },
    get hasTrack() {
      return audio !== null;
    },

    start(): void {
      if (!audio) return;
      audio.addEventListener('ended', next);
      void audio
        .play()
        .then(() => rampTo(VOLUME, FADE_IN))
        .catch(() => {
          // Barrado pelo navegador: espera alguém encostar na página.
          if (unlocking) return;
          unlocking = true;
          window.addEventListener('pointerdown', unlock);
          window.addEventListener('keydown', unlock);
        });
    },

    toggleMute(): boolean {
      muted = !muted;
      if (audio) {
        if (muted) rampTo(0, FADE);
        else {
          void audio.play().catch(() => undefined);
          rampTo(VOLUME, FADE);
        }
      }
      return muted;
    },

    dispose(): void {
      window.clearInterval(fade);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (audio) {
        audio.removeEventListener('ended', next);
        audio.pause();
        audio.remove();
      }
    },
  };
}
