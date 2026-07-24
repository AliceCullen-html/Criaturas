import type { CreatureSnapshot } from '@simulation';
import { useUiStore } from '../store/simulationStore';
import type { GameActions } from '../App';

const INTENT_LABELS: Record<CreatureSnapshot['intent'], string> = {
  wander: 'Explorando',
  seekFood: 'Procurando comida',
  seekWater: 'Procurando água',
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

type Tone = 'good' | 'warn' | 'bad' | 'info';

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

function bondLabel(bond: number): { text: string; tone: Tone } {
  if (bond > 0.6) return { text: 'Devotada a você', tone: 'good' };
  if (bond > 0.25) return { text: 'Confia em você', tone: 'good' };
  if (bond > 0.05) return { text: 'Está se acostumando', tone: 'info' };
  if (bond > -0.05) return { text: 'Indiferente', tone: 'info' };
  if (bond > -0.35) return { text: 'Desconfiada', tone: 'warn' };
  return { text: 'Tem medo de você', tone: 'bad' };
}

export function CreaturePanel({ actions }: { actions: GameActions }) {
  const creature = useUiStore((state) => state.selected);
  const followId = useUiStore((state) => state.followId);

  if (!creature) return null;

  const following = followId === creature.id;
  const bond = bondLabel(creature.bond);
  const bondPct = Math.round(((creature.bond + 1) / 2) * 100);

  const onRename = (): void => {
    const name = window.prompt('Novo nome da criatura:', creature.name);
    if (name && name.trim()) actions.rename(name.trim());
  };

  return (
    <aside className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__name">
            {creature.name} {creature.isBaby && <span className="tag tag--baby">filhote</span>}
          </h2>
          <p className="panel__sub">
            {MOOD_FACES[creature.mood]} {INTENT_LABELS[creature.intent]} ·{' '}
            {creature.sex === 'M' ? '♂' : '♀'} · Ger. {creature.generation}
          </p>
        </div>
        <button className="icon-btn" onClick={actions.deselect} aria-label="Fechar">
          ✕
        </button>
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
        <h3 className="panel__label">Memórias recentes</h3>
        {creature.memories.length === 0 ? (
          <p className="empty">Ainda não viveu nada marcante.</p>
        ) : (
          <ul className="memories">
            {creature.memories.map((episode, index) => (
              <li
                key={`${episode.text}-${index}`}
                className={`memory memory--${episode.valence >= 0 ? 'good' : 'bad'}`}
              >
                {episode.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel__section">
        <h3 className="panel__label">Interagir</h3>
        <div className="panel__actions">
          <button className="btn btn--primary" onClick={() => actions.interact('pet')}>
            Carinho
          </button>
          <button className="btn btn--primary" onClick={() => actions.interact('feed')}>
            Alimentar
          </button>
          <button className="btn btn--primary" onClick={() => actions.interact('play')}>
            Brincar
          </button>
          <button className="btn btn--primary" onClick={() => actions.interact('gift')}>
            Presente
          </button>
        </div>
        <div className="panel__actions panel__actions--rough">
          <button className="btn btn--rough" onClick={() => actions.interact('push')}>
            Empurrar
          </button>
          <button className="btn btn--rough" onClick={() => actions.interact('scare')}>
            Assustar
          </button>
          <button className="btn btn--rough" onClick={() => actions.interact('hit')}>
            Bater
          </button>
        </div>
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
        <div className="lineage__row">
          <span className="lineage__label">Pais</span>
          <span className="lineage__value">
            {creature.parentA && creature.parentB
              ? `${creature.parentA} × ${creature.parentB}`
              : 'Ancestral'}
          </span>
        </div>
      </div>

      <div className="panel__actions">
        <button className="btn" onClick={onRename}>
          Renomear
        </button>
        <button
          className={`btn${following ? ' btn--active' : ''}`}
          onClick={actions.toggleFollow}
          aria-pressed={following}
        >
          {following ? 'Seguindo' : 'Seguir'}
        </button>
      </div>
    </aside>
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
