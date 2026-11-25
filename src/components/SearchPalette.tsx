import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchAll, type SearchHit } from '../lib/search';
import { deckUrl, dueCards, useData, type Deck, type DeckFile } from '../lib/store';
import { toolWindows } from '../lib/toolWindows';
import { FileViewer } from './FileViewer';
import {
  IconCalendar,
  IconCards,
  IconChart,
  IconChecklist,
  IconDoc,
  IconFolder,
  IconLibrary,
  IconNote,
  IconPlay,
  IconPractice,
  IconSearch,
  IconSparkle,
  IconTimer,
  IconTools,
} from './Icons';
import { Modal } from './Modal';

const GROUP: Record<SearchHit['kind'], string> = {
  course: 'Kurse',
  deck: 'Decks',
  skill: 'Skills',
  exam: 'Prüfungen',
  todo: 'To-dos',
  tool: 'Werkzeuge',
  file: 'Dateien',
  card: 'Karten',
};

type QuickAction = {
  id: string;
  group: string;
  title: string;
  sub: string;
  icon: ReactNode;
  run: () => void;
};

/** The search word marked in a text. */
function Mark({ text, term }: { text: string; term: string }) {
  const i = term ? text.toLocaleLowerCase('de').indexOf(term) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
}

/** Strg+K: global command palette & search across courses, decks, skills, exams, to-dos, tools, files and cards. */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const data = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [viewing, setViewing] = useState<{ deck: Deck; file: DeckFile } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchAll(data, q), [data, q]);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    document.querySelector('.search-hit.on')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const quickActions = useMemo<QuickAction[]>(() => {
    const dueDecks = data.decks.filter((d) => !d.archived && dueCards(d).length > 0).sort((a, b) => dueCards(b).length - dueCards(a).length);
    const totalDue = dueDecks.reduce((n, d) => n + dueCards(d).length, 0);
    const list: QuickAction[] = [];
    if (totalDue > 0 && dueDecks[0]) {
      list.push({
        id: 'act-due',
        group: 'Schnellaktionen',
        title: `Fällige Karten lernen (${totalDue})`,
        sub: `Startet mit „${dueDecks[0].name}“`,
        icon: <IconPlay size={16} />,
        run: () => navigate(deckUrl(data, dueDecks[0], 'learn')),
      });
    }
    list.push(
      {
        id: 'act-pomo',
        group: 'Schnellaktionen',
        title: 'Pomodoro-Timer öffnen',
        sub: 'Schwebendes Fokus-Fenster',
        icon: <IconTimer size={16} />,
        run: () => toolWindows.open('pomodoro'),
      },
      {
        id: 'act-calc',
        group: 'Schnellaktionen',
        title: 'Wissenschaftlicher Rechner',
        sub: 'Schwebender Rechner & Einheiten',
        icon: <IconTools size={16} />,
        run: () => toolWindows.open('calc'),
      },
      {
        id: 'act-notes',
        group: 'Schnellaktionen',
        title: 'Notizblock & Schmierblatt',
        sub: 'Schwebende Notizen öffnen',
        icon: <IconNote size={16} />,
        run: () => toolWindows.open('notes'),
      },
      {
        id: 'act-lib',
        group: 'Navigation',
        title: 'Bibliothek',
        sub: 'Alle Kurse, Ordner und Decks',
        icon: <IconLibrary size={16} />,
        run: () => navigate('/library'),
      },
      {
        id: 'act-skills',
        group: 'Navigation',
        title: 'Skills & Mini-Skills',
        sub: 'Interaktive Lernpfade',
        icon: <IconPractice size={16} />,
        run: () => navigate('/skills'),
      },
      {
        id: 'act-exams',
        group: 'Navigation',
        title: 'Prüfungen & Kalender',
        sub: 'Termine, Tagesplan und Probeprüfungen',
        icon: <IconCalendar size={16} />,
        run: () => navigate('/tools?tab=exams'),
      },
      {
        id: 'act-stats',
        group: 'Navigation',
        title: 'Statistik & Aquarium',
        sub: 'Serie, Lernzeit und 30-Tage-Prognose',
        icon: <IconChart size={16} />,
        run: () => navigate('/stats'),
      },
    );
    // Add up to 3 recently touched active decks
    const recent = [...data.decks]
      .filter((d) => !d.archived)
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      .slice(0, 3);
    for (const d of recent) {
      const n = dueCards(d).length;
      list.push({
        id: 'rec-' + d.id,
        group: 'Zuletzt bearbeitet',
        title: d.name,
        sub: `${d.cards.length} Karten${n > 0 ? ` · ${n} fällig` : ''}`,
        icon: <IconCards size={16} />,
        run: () => navigate(deckUrl(data, d)),
      });
    }
    return list;
  }, [data, navigate]);

  const openHit = (h: SearchHit) => {
    if (h.kind === 'file') {
      const d = data.decks.find((x) => x.id === h.deckId);
      const f = d?.files?.find((x) => x.id === h.id);
      if (d && f) setViewing({ deck: d, file: f });
      return;
    }
    if (h.kind === 'course') {
      const c = data.courses.find((x) => x.id === h.id);
      const w = c && data.workspaces.find((x) => x.id === c.workspaceId);
      if (c && w) navigate(`/library/${w.slug}/${c.slug}`);
    } else if (h.kind === 'skill') {
      navigate(`/skills/${h.id}`);
    } else if (h.kind === 'exam') {
      navigate('/tools?tab=exams');
    } else if (h.kind === 'todo') {
      navigate('/tools?tab=todos');
    } else if (h.kind === 'tool') {
      navigate(h.route);
    } else {
      const d = data.decks.find((x) => x.id === (h.kind === 'deck' ? h.id : h.deckId));
      if (d) navigate(h.kind === 'deck' ? deckUrl(data, d) : `${deckUrl(data, d, 'cards')}&q=${encodeURIComponent(h.term)}`);
    }
    onClose();
  };

  const hasQuery = q.trim().length > 0;
  const listLen = hasQuery ? hits.length : quickActions.length;

  const hitIcon = (kind: SearchHit['kind']) => {
    switch (kind) {
      case 'course':
        return <IconFolder size={16} />;
      case 'deck':
        return <IconCards size={16} />;
      case 'skill':
        return <IconSparkle size={16} />;
      case 'exam':
        return <IconCalendar size={16} />;
      case 'todo':
        return <IconChecklist size={16} />;
      case 'tool':
        return <IconTools size={16} />;
      case 'file':
        return <IconDoc size={16} />;
      default:
        return <IconNote size={16} />;
    }
  };

  const rows: ReactNode[] = [];
  if (hasQuery) {
    const term = q.trim().toLocaleLowerCase('de').split(/\s+/)[0] ?? '';
    hits.forEach((h, i) => {
      if (i === 0 || hits[i - 1].kind !== h.kind)
        rows.push(
          <li key={'g-' + h.kind} className="search-group" role="presentation">
            {GROUP[h.kind]}
          </li>,
        );
      rows.push(
        <li key={h.kind + h.id} role="option" aria-selected={i === active}>
          <button type="button" className={'search-hit' + (i === active ? ' on' : '')} onMouseEnter={() => setActive(i)} onClick={() => openHit(h)}>
            {hitIcon(h.kind)}
            <span className="search-text">
              <b>
                <Mark text={h.title} term={term} />
              </b>
              <small className="muted">
                {h.sub}
                {h.kind === 'card' && h.snippet ? ' · ' : ''}
                {h.kind === 'card' && <Mark text={h.snippet} term={h.term} />}
              </small>
            </span>
          </button>
        </li>,
      );
    });
  } else {
    quickActions.forEach((a, i) => {
      if (i === 0 || quickActions[i - 1].group !== a.group)
        rows.push(
          <li key={'qg-' + a.group} className="search-group" role="presentation">
            {a.group}
          </li>,
        );
      rows.push(
        <li key={a.id} role="option" aria-selected={i === active}>
          <button
            type="button"
            className={'search-hit' + (i === active ? ' on' : '')}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              a.run();
              onClose();
            }}
          >
            {a.icon}
            <span className="search-text">
              <b>{a.title}</b>
              <small className="muted">{a.sub}</small>
            </span>
          </button>
        </li>,
      );
    });
  }

  if (viewing) return <FileViewer file={viewing.file} deck={viewing.deck} onClose={onClose} />;
  return (
    <Modal title="Suchen & Schnellaktionen" onClose={onClose} className="search-modal">
      <div className="search-field">
        <IconSearch size={18} />
        <input
          ref={input}
          className="input"
          placeholder="Karten, Decks, Skills, Prüfungen, To-dos oder Werkzeuge …"
          aria-label="Suchen"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(Math.max(0, listLen - 1), a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              if (hasQuery && hits[active]) openHit(hits[active]);
              else if (!hasQuery && quickActions[active]) {
                quickActions[active].run();
                onClose();
              }
            }
          }}
        />
      </div>
      {hasQuery && !hits.length ? (
        <p className="muted small">Nichts gefunden.</p>
      ) : (
        <ul className="search-list" role="listbox" aria-label={hasQuery ? 'Treffer' : 'Schnellaktionen'}>
          {rows}
        </ul>
      )}
      <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
        ↑ ↓ wählen · Enter öffnen · Esc schließen · durchsucht auch Tags & Hinweise
      </p>
    </Modal>
  );
}
