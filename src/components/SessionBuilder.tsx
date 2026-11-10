import { useMemo, useState } from 'react';
import { levelOf } from '../lib/srs';
import { useData } from '../lib/store';
import { allTags, hasTag } from '../lib/tags';
import { DeckPicker } from './DeckPicker';
import { Modal } from './Modal';
import type { SessionItem } from './StudySession';

type Which = 'due' | 'hard' | 'new' | 'all';
const WHICH: { id: Which; label: string; hint: string }[] = [
  { id: 'due', label: 'Fällige', hint: 'jetzt zur Wiederholung dran' },
  { id: 'hard', label: 'Schwierige', hint: 'oft vergessen oder als schwer bewertet' },
  { id: 'new', label: 'Neue', hint: 'noch nie gelernt' },
  { id: 'all', label: 'Alle', hint: 'freies Üben' },
];

/** Put together a study round over several decks, filtered by tags and card state. */
export function SessionBuilder({ onClose, onStart }: { onClose: () => void; onStart: (title: string, items: SessionItem[]) => void }) {
  const data = useData();
  const [deckIds, setDeckIds] = useState<string[]>(() => data.decks.map((d) => d.id));
  const [tags, setTags] = useState<string[]>([]);
  const [which, setWhich] = useState<Which>('due');
  const [limit, setLimit] = useState(50);
  const [shuffle, setShuffle] = useState(true);

  const decks = data.decks.filter((d) => deckIds.includes(d.id));
  const tagList = useMemo(() => allTags(decks.flatMap((d) => d.cards)), [decks]);
  const now = Date.now();
  // cards rated "Nochmal"/"Schwer" in the last 30 days
  const recentlyHard = useMemo(
    () => new Set(data.reviews.filter((r) => r.rating <= 2 && r.at > Date.now() - 30 * 86_400_000).map((r) => r.cardId)),
    [data.reviews],
  );
  const items = decks.flatMap((d) =>
    d.cards
      .filter((c) => !tags.length || tags.some((t) => hasTag(c, t)))
      .filter((c) =>
        which === 'due'
          ? !!c.srs.last && c.srs.due <= now
          : which === 'new'
            ? !c.srs.last
            : which === 'hard'
              ? c.srs.lapses > 0 || c.srs.ease < 2.3 || recentlyHard.has(c.id) || (!!c.srs.last && levelOf(c.srs) === 'learning')
              : true,
      )
      .map((c) => ({ deckId: d.id, cardId: c.id, ease: c.srs.ease })),
  );

  const start = () => {
    let list = which === 'hard' ? [...items].sort((a, b) => a.ease - b.ease) : [...items];
    if (shuffle) list = list.sort(() => Math.random() - 0.5);
    const label = WHICH.find((w) => w.id === which)!.label;
    const title = `${label} Karten${tags.length ? ` · #${tags.join(' #')}` : ''}`;
    onStart(title, list.slice(0, limit || list.length).map(({ deckId, cardId }) => ({ deckId, cardId })));
  };
  const count = Math.min(items.length, limit || items.length);

  return (
    <Modal
      title="Lernrunde zusammenstellen"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={start} disabled={!items.length}>
            {items.length ? `${count} ${count === 1 ? 'Karte' : 'Karten'} lernen` : 'Keine passenden Karten'}
          </button>
        </>
      }
    >
      <span className="field-label">Welche Karten?</span>
      <div className="seg wrap" role="radiogroup" aria-label="Welche Karten">
        {WHICH.map((w) => (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={which === w.id}
            title={w.hint}
            className={`seg-btn ${which === w.id ? 'on' : ''}`}
            onClick={() => setWhich(w.id)}
          >
            {w.label}
          </button>
        ))}
      </div>
      <span className="field-label">Aus diesen Decks</span>
      <DeckPicker value={deckIds} onChange={setDeckIds} />
      {tagList.length > 0 && (
        <>
          <span className="field-label">Nur mit diesen Tags (optional)</span>
          <div className="tag-filter">
            {tagList.slice(0, 40).map((t) => (
              <button
                key={t}
                type="button"
                className={`tag ${tags.includes(t) ? 'on' : ''}`}
                onClick={() => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
              >
                {t}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="sess-limit">
            Höchstens
          </label>
          <select id="sess-limit" className="input" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[20, 50, 100, 200, 0].map((n) => (
              <option key={n} value={n}>
                {n ? `${n} Karten` : 'alle'}
              </option>
            ))}
          </select>
        </div>
        <label className="check-row" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
          <span>Gemischt</span>
        </label>
      </div>
    </Modal>
  );
}
