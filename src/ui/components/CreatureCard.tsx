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

function ageLabel(creature: CreatureSnapshot): string {
  if (creature.isBaby) return 'filhote';
  if (creature.isElder) return 'idosa';
  const years = Math.floor((creature.age / creature.lifespan) * 10);
  return `${Math.max(1, years)} anos`;
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
    </div>
  );
}
