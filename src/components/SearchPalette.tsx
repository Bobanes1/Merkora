import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchAll, type SearchHit } from '../lib/search';
import { deckUrl, useData, type Deck, type DeckFile } from '../lib/store';
import { FileViewer } from './FileViewer';
import { IconCards, IconDoc, IconFolder, IconNote, IconSearch } from './Icons';
import { Modal } from './Modal';

const GROUP: Record<SearchHit['kind'], string> = { course: 'Kurse', deck: 'Decks', file: 'Dateien', card: 'Karten' };

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

/** Strg+K: search courses, decks and cards; arrow keys and Enter open, Esc closes. */
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

  const open = (h: SearchHit) => {
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
    } else {
      const d = data.decks.find((x) => x.id === (h.kind === 'deck' ? h.id : (h as { deckId: string }).deckId));
      if (d) navigate(h.kind === 'deck' ? deckUrl(data, d) : `${deckUrl(data, d, 'cards')}&q=${encodeURIComponent(h.term)}`);
    }
    onClose();
  };

  const rows: ReactNode[] = [];
  hits.forEach((h, i) => {
    if (i === 0 || hits[i - 1].kind !== h.kind)
      rows.push(
        <li key={'g-' + h.kind} className="search-group" role="presentation">
          {GROUP[h.kind]}
        </li>,
      );
    const Icon = h.kind === 'course' ? IconFolder : h.kind === 'deck' ? IconCards : h.kind === 'file' ? IconDoc : IconNote;
    const term = q.trim().toLocaleLowerCase('de').split(/\s+/)[0] ?? '';
    rows.push(
      <li key={h.kind + h.id} role="option" aria-selected={i === active}>
        <button type="button" className={'search-hit' + (i === active ? ' on' : '')} onMouseEnter={() => setActive(i)} onClick={() => open(h)}>
          <Icon size={16} />
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

  if (viewing) return <FileViewer file={viewing.file} deck={viewing.deck} onClose={onClose} />;
  return (
    <Modal title="Suchen" onClose={onClose} className="search-modal">
      <div className="search-field">
        <IconSearch size={18} />
        <input
          ref={input}
          className="input"
          placeholder="Karten, Decks und Kurse durchsuchen …"
          aria-label="Suchen"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && hits[active]) open(hits[active]);
          }}
        />
      </div>
      {q.trim() ? (
        hits.length ? (
          <ul className="search-list" role="listbox" aria-label="Treffer">
            {rows}
          </ul>
        ) : (
          <p className="muted small">Nichts gefunden.</p>
        )
      ) : (
        <p className="muted small">Tipp: mehrere Wörter grenzen die Suche ein. ↑ ↓ wählen, Enter öffnet.</p>
      )}
    </Modal>
  );
}
