import type { CreatureSnapshot } from '@simulation';
import { useUiStore } from '../store/simulationStore';
import type { GameActions } from '../App';

const INTENT_LABELS: Record<CreatureSnapshot['intent'], string> = {
  wander: 'Explorando',
  seekFood: 'Procurando comida',
  seekWater: 'Procurando água',
  rest: 'Descansando',
};

function StatBar({ label, value, tone }: { label: string; value: number; tone: 'good' | 'warn' }) {
  const pct = Math.round(value * 100);
  return (
    <div className="bar">
      <div className="bar__head">
        <span>{label}</span>
        <span className="bar__val">{pct}%</span>
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

export function CreaturePanel({ actions }: { actions: GameActions }) {
  const creature = useUiStore((state) => state.selected);
  const followId = useUiStore((state) => state.followId);

  if (!creature) return null;

  const following = followId === creature.id;

  const onRename = (): void => {
    const name = window.prompt('Novo nome da criatura:', creature.name);
    if (name && name.trim()) actions.rename(name.trim());
  };

  return (
    <aside className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__name">{creature.name}</h2>
          <p className="panel__sub">
            {creature.species} · {creature.sex === 'M' ? '♂' : '♀'} ·{' '}
            {INTENT_LABELS[creature.intent]}
          </p>
        </div>
        <button className="icon-btn" onClick={actions.deselect} aria-label="Fechar">
          ✕
        </button>
      </header>

      <div className="panel__bars">
        <StatBar label="Fome" value={creature.hunger} tone="warn" />
        <StatBar label="Sede" value={creature.thirst} tone="warn" />
        <StatBar label="Energia" value={creature.energy} tone="good" />
        <StatBar label="Saúde" value={creature.health} tone="good" />
        <StatBar label="Felicidade" value={creature.happiness} tone="good" />
      </div>

      <div className="panel__attrs">
        <Attr
          label="Idade"
          value={`${Math.floor(creature.age)}s / ${Math.floor(creature.lifespan)}s`}
        />
        <Attr label="Velocidade" value={creature.speed.toFixed(0)} />
        <Attr label="Visão" value={creature.vision.toFixed(0)} />
        <Attr label="Força" value={creature.strength.toFixed(2)} />
        <Attr label="Fertilidade" value={creature.fertility.toFixed(2)} />
        <Attr label="Tamanho" value={creature.size.toFixed(1)} />
      </div>

      <div className="panel__lineage">
        <div className="lineage__row">
          <span className="lineage__label">DNA</span>
          <span className="lineage__dna">
            <span
              className="lineage__swatch"
              style={{ backgroundColor: `#${creature.dna.toString(16).padStart(6, '0')}` }}
            />
            <code>#{creature.dna.toString(16).padStart(6, '0').toUpperCase()}</code>
          </span>
        </div>
        <div className="lineage__row">
          <span className="lineage__label">Geração</span>
          <span className="lineage__value">{creature.generation}</span>
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
        <button className="btn btn--primary" onClick={actions.feed}>
          Alimentar
        </button>
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
