import { useEffect, useRef } from 'react';
import type { CreatureSnapshot } from '@simulation';
import { useUiStore } from '../store/simulationStore';
import { cardAnchor } from '../cardAnchor';

const MOOD_LABELS: Record<CreatureSnapshot['mood'], string> = {
  neutral: 'tranquila',
  happy: 'feliz',
  needy: 'carente',
  sleepy: 'com sono',
  surprised: 'assustada',
  angry: 'brava',
  sad: 'triste',
  loved: 'derretendo',
  afraid: 'com medo',
  curious: 'curiosa',
  hungry: 'com fome',
  thirsty: 'com sede',
  playful: 'brincalhona',
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
  curious: '🤔',
  hungry: '🍎',
  thirsty: '💧',
  playful: '🤸',
};

const MARGIN = 12;

/** A necessidade mais urgente, em uma palavra. */
function mainNeed(creature: CreatureSnapshot): string {
  const needs: Array<[string, number]> = [
    ['fome', creature.needs.hunger],
    ['sede', creature.needs.thirst],
    ['cansaço', 1 - creature.needs.energy],
    ['solidão', creature.emotions.loneliness],
  ];
  let worst = needs[0]!;
  for (const need of needs) if (need[1] > worst[1]) worst = need;
  return worst[1] < 0.35 ? 'nada lhe falta' : worst[0];
}

/**
 * O que dizer de uma criatura marcada.
 *
 * Sem número e sem barra: é uma frase sobre ela, do jeito que alguém falaria
 * de um bicho que apanhou. A escala existe porque "assustadiça" e "vive com
 * medo" são coisas diferentes, e o jogador merece saber qual delas ele fez.
 */
function scarLabel(scar: number): string {
  if (scar > 0.5) return '💔 vive com medo — algo aconteceu com ela';
  if (scar > 0.25) return '💔 desconfiada desde que se machucou';
  return '💔 assustadiça';
}

function ageLabel(creature: CreatureSnapshot): string {
  if (creature.egg >= 0) return 'ovo';
  if (creature.isBaby) return 'filhote';
  if (creature.isElder) return 'idosa';
  const years = Math.floor((creature.age / creature.lifespan) * 10);
  return `${Math.max(1, years)} anos`;
}

/** O que dizer de um ovo. Segure a mão em cima dele para chocar mais rápido. */
function eggLabel(progress: number): string {
  if (progress > 0.85) return '🥚 a casca está rachando';
  if (progress > 0.5) return '🥚 está quase';
  return '🥚 esquente com a mão';
}

/**
 * Cartão flutuante. Aparece junto da criatura ao clicar e some sozinho depois
 * de alguns segundos — é a única interface do jogo.
 */
export function CreatureCard() {
  const creature = useUiStore((state) => state.selected);
  const ref = useRef<HTMLDivElement>(null);

  // Acompanha a criatura sem passar pelo React: só mexe no transform.
  useEffect(() => {
    let raf = 0;
    const follow = (): void => {
      const element = ref.current;
      if (element) {
        // Preso à viewport: perto das bordas o cartão desliza em vez de sumir.
        const half = element.offsetWidth / 2;
        const height = element.offsetHeight;
        const x = Math.min(
          Math.max(cardAnchor.x, half + MARGIN),
          window.innerWidth - half - MARGIN,
        );
        const y = Math.min(Math.max(cardAnchor.y, height + MARGIN), window.innerHeight - MARGIN);
        element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
        element.style.opacity = cardAnchor.visible ? '1' : '0';
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!creature) return null;

  // O ovo tem ficha própria, e curta: quem está lá dentro e o quanto falta.
  // Mostrar humor, fome e amizades de quem ainda não nasceu seria mentira.
  if (creature.egg >= 0) {
    return (
      <div className="card" ref={ref}>
        <div className="card__name">
          {creature.name}
          <span className="card__age">ovo</span>
        </div>
        <div className="card__need">{eggLabel(creature.egg)}</div>
        <div className="card__hatch">
          <div
            className="card__hatchFill"
            style={{ width: `${Math.round(creature.egg * 100)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="card" ref={ref}>
      <div className="card__name">
        {creature.name}
        <span className="card__age">{ageLabel(creature)}</span>
      </div>
      <div className="card__mood">
        {MOOD_FACES[creature.mood]} {MOOD_LABELS[creature.mood]}
      </div>
      {/* Se há uma história em curso, ela vem no lugar da necessidade: contar
          que ela está levando comida para alguém vale mais que "fome". */}
      <div className="card__need">{creature.story || mainNeed(creature)}</div>
      {/* A MARCA.
          Só aparece em quem tem — e quem tem, tem por algo que aconteceu no
          jardim. É a única linha da ficha que acusa o jogador, e ela precisa
          existir: sem isso, maltratar uma criatura é um número escondido. */}
      {creature.scar > 0.08 && <div className="card__scar">{scarLabel(creature.scar)}</div>}
      {/* De quem ela gosta. Só aparece quando existe: uma linha vazia dizendo
          "sem amigos" seria uma acusação, não uma informação. */}
      {creature.friend && <div className="card__friend">amiga de {creature.friend}</div>}
      {/* O que ela sabe dizer. É a única coisa da ficha que o jogador CONSTRÓI:
          o resto ele observa, isto ele ensinou. */}
      {creature.words.length > 0 && (
        <div className="card__words">
          {creature.words.map((word) => (
            <span key={word} className="card__word">
              {word}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
