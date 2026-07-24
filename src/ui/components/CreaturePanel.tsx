import type { CreatureSnapshot } from '@simulation';
import { useUiStore } from '../store/simulationStore';

const INTENT_LABELS: Record<CreatureSnapshot['intent'], string> = {
  wander: 'Explorando',
  seekFood: 'Procurando comida',
  seekWater: 'Indo beber água',
  sleep: 'Dormindo',
  flee: 'Fugindo!',
  approachPlayer: 'Vindo até você',
  socialize: 'Fazendo companhia',
  play: 'Brincando',
  attack: 'Brigando!',
  share: 'Dividindo comida',
  mate: 'Cortejando',
};

const MOOD_FACES: Record<CreatureSnapshot['mood'], string> = {
  neutral: '🙂',
  happy: '😊',
  needy: '🥺',
  sleepy: '😴',
  surprised: '😲',
  angry: '😡',
  sad: '😢',
  loved: '😍',
  afraid: '😨',
};

type Tone = 'good' | 'warn' | 'bad' | 'info';

const EMOTION_ROWS: Array<{ key: keyof CreatureSnapshot['emotions']; label: string; tone: Tone }> =
  [
    { key: 'happiness', label: 'Felicidade', tone: 'good' },
    { key: 'trust', label: 'Confiança', tone: 'good' },
    { key: 'curiosity', label: 'Curiosidade', tone: 'info' },
    { key: 'fear', label: 'Medo', tone: 'bad' },
    { key: 'stress', label: 'Estresse', tone: 'bad' },
    { key: 'anger', label: 'Raiva', tone: 'bad' },
    { key: 'sleepiness', label: 'Sono', tone: 'info' },
    { key: 'loneliness', label: 'Solidão', tone: 'info' },
  ];

function Bar({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const pct = Math.round(value * 100);
  return (
    <div className="bar">
      <div className="bar__head">
        <span>{label}</span>
        <span className="bar__val">{pct}</span>
      </div>
      <div className="bar__track">
        <div className={`bar__fill bar__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Attr({ label, value }: { label: string; value: string }) {
  return (
    <div className="attr">
      <span className="attr__label">{label}</span>
      <span className="attr__value">{value}</span>
    </div>
  );
}

function bondLabel(bond: number): { text: string; tone: Tone } {
  if (bond > 0.6) return { text: 'Devotada a você', tone: 'good' };
  if (bond > 0.25) return { text: 'Confia em você', tone: 'good' };
  if (bond > 0.05) return { text: 'Está se acostumando', tone: 'info' };
  if (bond > -0.05) return { text: 'Indiferente', tone: 'info' };
  if (bond > -0.35) return { text: 'Desconfiada', tone: 'warn' };
  return { text: 'Tem medo de você', tone: 'bad' };
}

/** Tempo de simulação relativo, em linguagem natural. */
function timeAgo(tick: number, now: number): string {
  const seconds = Math.max(0, (now - tick) / 20);
  if (seconds < 60) return 'agora há pouco';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)} h`;
}

/**
 * Painel de OBSERVAÇÃO. Não há nenhuma ação aqui — tudo o que o jogador faz
 * acontece no mundo, com a mão. Isto é uma janela para a vida interior da
 * criatura, não um controle remoto.
 */
export function CreaturePanel() {
  const creature = useUiStore((state) => state.selected);
  const tick = useUiStore((state) => state.stats.tick);

  if (!creature) return null;

  const bond = bondLabel(creature.bond);
  const bondPct = Math.round(((creature.bond + 1) / 2) * 100);

  return (
    <aside className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__name">
            {creature.name} {creature.isBaby && <span className="tag tag--baby">filhote</span>}
            {creature.isElder && <span className="tag tag--elder">idosa</span>}
          </h2>
          <p className="panel__sub">
            {MOOD_FACES[creature.mood]} {INTENT_LABELS[creature.intent]} ·{' '}
            {creature.sex === 'M' ? '♂' : '♀'} · Ger. {creature.generation}
          </p>
        </div>
      </header>

      {creature.personality.length > 0 && (
        <div className="traits">
          {creature.personality.map((trait) => (
            <span key={trait} className="tag">
              {trait}
            </span>
          ))}
        </div>
      )}

      <div className={`bond bond--${bond.tone}`}>
        <div className="bond__head">
          <span>Vínculo com você</span>
          <strong>{bond.text}</strong>
        </div>
        <div className="bond__track">
          <div className="bond__fill" style={{ width: `${bondPct}%` }} />
        </div>
        {creature.trauma > 0.1 && (
          <p className="bond__trauma">
            Carrega um trauma ({Math.round(creature.trauma * 100)}). Vai levar muito tempo e muitas
            experiências boas para voltar a confiar.
          </p>
        )}
      </div>

      <section className="panel__section">
        <h3 className="panel__label">Corpo</h3>
        <div className="panel__bars">
          <Bar label="Fome" value={creature.needs.hunger} tone="warn" />
          <Bar label="Sede" value={creature.needs.thirst} tone="warn" />
          <Bar label="Energia" value={creature.needs.energy} tone="good" />
          <Bar label="Saúde" value={creature.needs.health} tone="good" />
        </div>
      </section>

      <section className="panel__section">
        <h3 className="panel__label">Emoções</h3>
        <div className="panel__bars">
          {EMOTION_ROWS.map((row) => (
            <Bar
              key={row.key}
              label={row.label}
              value={creature.emotions[row.key]}
              tone={row.tone}
            />
          ))}
        </div>
      </section>

      <section className="panel__section">
        <h3 className="panel__label">Família</h3>
        <div className="family">
          <div className="family__row">
            <span className="family__label">Pais</span>
            <span className="family__value">
              {creature.parentA && creature.parentB
                ? `${creature.parentA} × ${creature.parentB}`
                : 'Ancestral'}
            </span>
          </div>
          <div className="family__row">
            <span className="family__label">Filhotes</span>
            <span className="family__value">
              {creature.children.length > 0 ? creature.children.join(', ') : '—'}
            </span>
          </div>
        </div>
      </section>

      {creature.friends.length > 0 && (
        <section className="panel__section">
          <h3 className="panel__label">Amizades</h3>
          <ul className="friends">
            {creature.friends.map((friend) => (
              <li
                key={friend.name}
                className={`friend friend--${friend.affinity >= 0 ? 'good' : 'bad'}`}
              >
                <span>{friend.name}</span>
                <span className="friend__note">
                  {friend.affinity >= 0.5
                    ? 'melhor amiga'
                    : friend.affinity >= 0
                      ? 'conhecida'
                      : 'evita'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel__section">
        <h3 className="panel__label">História de vida</h3>
        {creature.memories.length === 0 ? (
          <p className="empty">Ainda não viveu nada marcante.</p>
        ) : (
          <ul className="memories">
            {creature.memories.map((episode, index) => (
              <li
                key={`${episode.text}-${index}`}
                className={`memory memory--${episode.valence >= 0 ? 'good' : 'bad'}`}
              >
                <span className="memory__text">{episode.text}</span>
                <span className="memory__meta">
                  {timeAgo(episode.tick, tick)} · {episode.emotion}
                  {episode.intensity > 0.7 ? ' · marcante' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="panel__attrs">
        <Attr label="Idade" value={`${Math.floor(creature.age)}s`} />
        <Attr label="Expectativa" value={`${Math.floor(creature.lifespan)}s`} />
        <Attr label="Velocidade" value={creature.speed.toFixed(0)} />
        <Attr label="Visão" value={creature.vision.toFixed(0)} />
        <Attr label="Força" value={creature.strength.toFixed(2)} />
        <Attr label="Fertilidade" value={creature.fertility.toFixed(2)} />
      </div>

      <div className="panel__lineage">
        <div className="lineage__row">
          <span className="lineage__label">DNA</span>
          <code className="lineage__dna">{creature.dna}</code>
        </div>
      </div>
    </aside>
  );
}
