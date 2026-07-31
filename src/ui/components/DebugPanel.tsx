import { useUiStore } from '../store/simulationStore';

/**
 * A TAMPA ABERTA — o que está acontecendo dentro da cabeça dela.
 *
 * Um cérebro por utilidade é uma caixa preta: entra o mundo, sai uma intenção.
 * Enquanto a conta ficava só na memória do processador, "por que ela foi para
 * lá?" não tinha resposta — nem para quem escreveu o código. Este painel é essa
 * resposta, e é uma ferramenta de construção antes de ser uma de jogo: sem ele,
 * afinar comportamento emergente é adivinhar.
 *
 * O que ele mostra é o que a criatura tem, e nada além: as notas que ela acabou
 * de dar a cada opção, o que a está apertando, o que ela sente, de quem gosta e
 * do que lembra. Nenhum número inventado para a tela — se um valor aparece
 * aqui, ele existe na simulação e é ele que decide.
 *
 * Fica fechado por padrão. O jogo é olhar o jardim e NÃO entender tudo; a
 * tampa existe para quem quer abrir.
 */
export function DebugPanel() {
  const debug = useUiStore((s) => s.debug);
  const bicho = useUiStore((s) => s.selected);
  const thinking = useUiStore((s) => s.thinking);

  if (!debug) return null;
  if (!bicho) {
    return (
      <aside className="mind mind--empty">
        <p className="mind__hint">Toque numa criatura para ver a cabeça dela.</p>
      </aside>
    );
  }

  const emocoes = Object.entries(bicho.emotions) as Array<[string, number]>;
  const dominante = emocoes.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
  const marcante = [...bicho.memories].sort((a, b) => b.intensity - a.intensity)[0];
  const maior = thinking?.options[0]?.score ?? 1;

  return (
    <aside className="mind">
      <header className="mind__head">
        <strong>{bicho.name}</strong>
        <span className="mind__now">{INTENCAO[bicho.intent] ?? bicho.intent}</span>
      </header>

      {/* A CONTA. É a linha mais importante do painel: mostra não só o que ela
          escolheu, mas o que quase ganhou — que é onde mora o comportamento
          emergente. Duas opções empatadas é uma criatura em dúvida. */}
      <section className="mind__box">
        <h4>O que ela pesou</h4>
        {thinking && thinking.options.length > 0 ? (
          <ul className="mind__bars">
            {thinking.options.slice(0, 8).map((o, i) => (
              <li key={o.intent} className={i === 0 ? 'mind__bar mind__bar--win' : 'mind__bar'}>
                <span className="mind__barName">{INTENCAO[o.intent] ?? o.intent}</span>
                <span className="mind__barTrack">
                  <span
                    className="mind__barFill"
                    style={{ width: `${Math.max(2, (o.score / (maior || 1)) * 100)}%` }}
                  />
                </span>
                <span className="mind__barNum">{o.score.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mind__hint">esperando ela decidir…</p>
        )}
      </section>

      <section className="mind__box">
        <h4>O que aperta</h4>
        <Barra rotulo="fome" valor={bicho.needs.hunger} />
        <Barra rotulo="sede" valor={bicho.needs.thirst} />
        <Barra rotulo="cansaço" valor={1 - bicho.needs.energy} />
        <Barra rotulo="saúde" valor={bicho.needs.health} bom />
      </section>

      <section className="mind__box">
        <h4>
          O que sente <em>· {TRADUZ[dominante[0]] ?? dominante[0]}</em>
        </h4>
        {emocoes
          .filter(([, v]) => Math.abs(v) > 0.04)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .slice(0, 6)
          .map(([nome, valor]) => (
            <Barra key={nome} rotulo={TRADUZ[nome] ?? nome} valor={valor} bom={BOAS.has(nome)} />
          ))}
      </section>

      {/* O PROJETO. Tudo o mais no painel é curto: a intenção dura segundos, o
          que aperta muda a todo instante. Esta linha é a única que responde
          "o que ela anda querendo da vida" — e ela sobrevive a um dia ruim. */}
      {bicho.goal && (
        <section className="mind__box">
          <h4>O que ela quer da vida</h4>
          <p className="mind__goal">
            {bicho.goal}
            <em> · há {Math.round(bicho.goalFor / 60)} min</em>
          </p>
        </section>
      )}

      {/* A EXPERIÊNCIA DE VIDA. É aqui que se vê duas irmãs de mesmo genoma
          virarem pessoas diferentes: a mesma lista, com números diferentes,
          porque a vida delas foi diferente. Nada disto está escrito no código —
          é a média do que aconteceu com o bem-estar de cada uma. */}
      {bicho.habits.length > 0 && (
        <section className="mind__box">
          <h4>O que costuma dar certo</h4>
          {bicho.habits.slice(0, 6).map((h) => (
            <Barra
              key={h.intent}
              rotulo={INTENCAO[h.intent] ?? h.intent}
              valor={h.value}
              bom={h.value >= 0.5}
            />
          ))}
        </section>
      )}

      {bicho.friends.length > 0 && (
        <section className="mind__box">
          <h4>Quem ela conhece</h4>
          <ul className="mind__list">
            {bicho.friends.slice(0, 5).map((f) => (
              <li key={f.name}>
                <span>{f.name}</span>
                <span className={f.affinity >= 0 ? 'mind__good' : 'mind__bad'}>
                  {f.affinity >= 0 ? '+' : ''}
                  {f.affinity.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {marcante && (
        <section className="mind__box">
          <h4>O que mais marcou</h4>
          <p className="mind__memory">
            “{marcante.text}”<em> · {marcante.emotion}</em>
          </p>
        </section>
      )}

      {bicho.words.length > 0 && (
        <section className="mind__box">
          <h4>O que ela sabe dizer</h4>
          <p className="mind__memory">{bicho.words.join(' · ')}</p>
        </section>
      )}
    </aside>
  );
}

function Barra({ rotulo, valor, bom }: { rotulo: string; valor: number; bom?: boolean }) {
  const largura = Math.min(100, Math.abs(valor) * 100);
  return (
    <div className="mind__bar">
      <span className="mind__barName">{rotulo}</span>
      <span className="mind__barTrack">
        <span
          className={`mind__barFill${bom ? ' mind__barFill--good' : ''}`}
          style={{ width: `${largura}%` }}
        />
      </span>
      <span className="mind__barNum">{valor.toFixed(2)}</span>
    </div>
  );
}

/** As intenções em português, como o resto da interface. */
const INTENCAO: Record<string, string> = {
  wander: 'vagar',
  seekFood: 'procurar comida',
  seekWater: 'procurar água',
  sleep: 'dormir',
  flee: 'fugir',
  approachPlayer: 'ir até você',
  socialize: 'conviver',
  play: 'brincar',
  attack: 'atacar',
  share: 'dividir',
  mate: 'cortejar',
  watch: 'observar',
  shelter: 'abrigar-se',
  sunbathe: 'tomar sol',
  search: 'investigar',
  follow: 'seguir',
  study: 'aprender',
};

const TRADUZ: Record<string, string> = {
  happiness: 'felicidade',
  fear: 'medo',
  trust: 'confiança',
  curiosity: 'curiosidade',
  stress: 'estresse',
  anger: 'raiva',
  sleepiness: 'sono',
  loneliness: 'solidão',
  trauma: 'trauma',
  scar: 'cicatriz',
  pain: 'dor',
};

/** As que é bom ter alto — para a barra não pintar tudo de vermelho. */
const BOAS = new Set(['happiness', 'trust', 'curiosity']);
