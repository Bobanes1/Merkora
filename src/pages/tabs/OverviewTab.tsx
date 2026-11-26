import type { ComponentType } from 'react';
import { IconBulb, IconCards, IconChart, IconDoc, IconHeadphones, IconMatch, IconMindmap, IconNote, IconPath, IconPlay, IconQuiz, IconPractice, IconTarget } from '../../components/Icons';
import { pathProgress } from '../../lib/path';
import { masteryPercent } from '../../lib/stats';
import { dueCards, type Deck } from '../../lib/store';

type Mode = { id: string; label: string; sub: string; icon: ComponentType<{ size?: number }>; main?: boolean };

/** Phone: a deck opens here first – all ways to learn it as large tiles. */
export default function OverviewTab({ deck, onOpen }: { deck: Deck; onOpen: (tab: string) => void }) {
  const due = dueCards(deck).length;
  const pct = masteryPercent(deck.cards);
  const path = pathProgress(deck);
  const n = deck.cards.length;
  const files = deck.files?.length ?? 0;
  const modes: Mode[] = [
    { id: 'learn', label: 'Lernen', sub: due ? `${due} fällig` : 'alles wiederholt', icon: IconPlay, main: true },
    { id: 'source', label: 'Material', sub: files ? `${files} ${files === 1 ? 'Datei' : 'Dateien'}` : 'Skript-Studio', icon: IconNote },
    { id: 'cards', label: 'Karten', sub: `${n} ${n === 1 ? 'Karte' : 'Karten'}`, icon: IconCards },
    { id: 'path', label: 'Lernpfad', sub: `${path.done} / ${path.total} Stationen`, icon: IconPath },
    { id: 'match', label: 'Zuordnen', sub: 'Spiel auf Zeit', icon: IconMatch },
    { id: 'quiz', label: 'Quiz', sub: 'Multiple Choice', icon: IconQuiz },
    { id: 'practice', label: 'Aufgaben', sub: 'Mathe, Java, Labore', icon: IconPractice },
    { id: 'feynman', label: 'Erklären', sub: 'Erklär es Pip', icon: IconBulb },
    { id: 'exam', label: 'Prüfung üben', sub: 'Probeprüfung', icon: IconTarget },
    { id: 'summary', label: 'Zusammenfassung', sub: 'zum Nachlesen', icon: IconDoc },
    { id: 'podcast', label: 'Podcast', sub: '2-Stimmen-Audio', icon: IconHeadphones },
    { id: 'mindmap', label: 'Mindmap', sub: 'Überblick', icon: IconMindmap },
    { id: 'mastery', label: 'Fortschritt', sub: `${pct} % beherrscht`, icon: IconChart },
  ];
  return (
    <div className="deck-overview">
      <div className="ov-stats">
        <span>
          <b>{n}</b> Karten
        </span>
        <span>
          <b>{due}</b> fällig
        </span>
        <span>
          <b>{pct} %</b> beherrscht
        </span>
      </div>
      <div className="ov-grid">
        {modes.map((m) => (
          <button key={m.id} type="button" className={`ov-tile mode-${m.id}` + (m.main ? ' main' : '')} onClick={() => onOpen(m.id)}>
            <m.icon size={22} />
            <b>{m.label}</b>
            <small>{m.sub}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
