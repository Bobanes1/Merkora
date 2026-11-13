import { useMemo, useState } from 'react';
import { useData, type Course, type Deck } from '../lib/store';
import { IconChevron, IconFolder, IconSearch } from './Icons';

/** What is chosen: single decks, and (for exams) whole courses / folders that also take in decks added later. */
export type Scope = { deckIds: string[]; courseIds?: string[]; folderIds?: string[] };

const n = (k: number, one: string, many: string) => `${k.toLocaleString('de-DE')} ${k === 1 ? one : many}`;

/**
 * Clear picker grouped by course and folder: search, fold courses open, see card counts.
 * With `whole`, ticking a course or folder means "everything in it, also what comes later".
 */
export function ScopePicker({ value, onChange, whole = false }: { value: Scope; onChange: (v: Scope) => void; whole?: boolean }) {
  const data = useData();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const courseIds = value.courseIds ?? [];
  const folderIds = value.folderIds ?? [];
  const decksOf = (c: Course) => data.decks.filter((d) => d.courseId === c.id);
  const covered = (d: Deck) => courseIds.includes(d.courseId) || (!!d.folderId && folderIds.includes(d.folderId));
  const picked = (d: Deck) => value.deckIds.includes(d.id) || covered(d);
  const anyPicked = (c: Course) => courseIds.includes(c.id) || decksOf(c).some(picked);
  const [open, setOpen] = useState<Set<string>>(() => new Set(data.courses.filter((c) => anyPicked(c) || data.courses.length === 1).map((c) => c.id)));

  const set = (patch: Partial<Scope>) => onChange({ ...value, ...patch });
  const toggleDecks = (ids: string[], on: boolean) => set({ deckIds: on ? [...new Set([...value.deckIds, ...ids])] : value.deckIds.filter((x) => !ids.includes(x)) });
  const toggleCourse = (c: Course, on: boolean) => {
    const ids = decksOf(c).map((d) => d.id);
    if (!whole) return toggleDecks(ids, on);
    // the whole course replaces its single decks and folders
    const folders = (c.folders ?? []).map((f) => f.id);
    set({
      courseIds: on ? [...courseIds, c.id] : courseIds.filter((x) => x !== c.id),
      deckIds: value.deckIds.filter((x) => !ids.includes(x)),
      folderIds: folderIds.filter((x) => !folders.includes(x)),
    });
  };
  const toggleFolder = (c: Course, folderId: string, on: boolean) => {
    const ids = decksOf(c).filter((d) => d.folderId === folderId).map((d) => d.id);
    if (!whole) return toggleDecks(ids, on);
    set({ folderIds: on ? [...folderIds, folderId] : folderIds.filter((x) => x !== folderId), deckIds: value.deckIds.filter((x) => !ids.includes(x)) });
  };

  const chosen = data.decks.filter(picked);
  const summary = useMemo(() => {
    const cards = chosen.reduce((s, d) => s + d.cards.length, 0);
    const parts = [n(chosen.length, 'Deck', 'Decks'), n(cards, 'Karte', 'Karten')];
    return parts.join(' · ');
  }, [chosen]);

  const deckRow = (d: Deck, indent: boolean) => {
    const auto = covered(d);
    return (
      <label key={d.id} className={'scope-deck' + (indent ? ' in-folder' : '') + (auto ? ' auto' : '')}>
        <input type="checkbox" checked={picked(d)} disabled={auto} onChange={(e) => toggleDecks([d.id], e.target.checked)} />
        <span className="scope-name">{d.name}</span>
        <small className="muted">{n(d.cards.length, 'Karte', 'Karten')}</small>
      </label>
    );
  };

  const workspaces = data.workspaces.filter((w) => data.courses.some((c) => c.workspaceId === w.id && decksOf(c).length));
  return (
    <div className="scope">
      <div className="scope-top">
        <div className="search scope-search">
          <IconSearch size={15} />
          <input placeholder="Kurs oder Deck suchen" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Kurse und Decks durchsuchen" />
        </div>
        <span className={'scope-sum' + (chosen.length ? ' on' : '')}>{chosen.length ? summary : 'Noch nichts ausgewählt'}</span>
      </div>
      <div className="scope-list">
        {workspaces.map((w) => (
          <div key={w.id} className="scope-ws">
            {workspaces.length > 1 && <div className="scope-ws-name">{w.name}</div>}
            {data.courses
              .filter((c) => c.workspaceId === w.id)
              .map((c) => {
                const decks = decksOf(c);
                if (!decks.length) return null;
                const match = (d: Deck) => !term || d.name.toLowerCase().includes(term) || c.name.toLowerCase().includes(term);
                const shownDecks = decks.filter(match);
                if (term && !shownDecks.length) return null;
                const isOpen = !!term || open.has(c.id);
                const wholeOn = courseIds.includes(c.id);
                const all = decks.every(picked);
                const some = !all && decks.some(picked);
                const cards = decks.reduce((s, d) => s + d.cards.length, 0);
                const folders = (c.folders ?? []).filter((f) => shownDecks.some((d) => d.folderId === f.id));
                const loose = shownDecks.filter((d) => !d.folderId || !folders.some((f) => f.id === d.folderId));
                return (
                  <div key={c.id} className={'scope-course' + (anyPicked(c) ? ' has' : '')}>
                    <div className="scope-course-head">
                      <button
                        type="button"
                        className={'icon-btn scope-fold' + (isOpen ? ' open' : '')}
                        aria-expanded={isOpen}
                        aria-label={`${c.name} ${isOpen ? 'zuklappen' : 'aufklappen'}`}
                        onClick={() => setOpen((s) => (s.has(c.id) ? new Set([...s].filter((x) => x !== c.id)) : new Set([...s, c.id])))}
                      >
                        <IconChevron size={15} />
                      </button>
                      <label className="scope-course-check">
                        <input
                          type="checkbox"
                          checked={whole ? wholeOn : all}
                          ref={(el) => {
                            if (el) el.indeterminate = whole ? !wholeOn && decks.some(picked) : some;
                          }}
                          onChange={(e) => toggleCourse(c, e.target.checked)}
                        />
                        <b>{c.name}</b>
                      </label>
                      <small className="muted">
                        {n(decks.length, 'Deck', 'Decks')} · {n(cards, 'Karte', 'Karten')}
                      </small>
                      {whole && wholeOn && <span className="scope-badge">ganzer Kurs · auch neue Decks</span>}
                    </div>
                    {isOpen && (
                      <div className="scope-body">
                        {folders.map((f) => {
                          const fDecks = shownDecks.filter((d) => d.folderId === f.id);
                          const fAll = decks.filter((d) => d.folderId === f.id);
                          const fWhole = folderIds.includes(f.id);
                          const fOn = whole ? fWhole || wholeOn : fAll.every(picked);
                          return (
                            <div key={f.id} className="scope-folder">
                              <label className={'scope-folder-head' + (wholeOn ? ' auto' : '')}>
                                <input
                                  type="checkbox"
                                  checked={fOn}
                                  disabled={whole && wholeOn}
                                  ref={(el) => {
                                    if (el) el.indeterminate = !fOn && fAll.some(picked);
                                  }}
                                  onChange={(e) => toggleFolder(c, f.id, e.target.checked)}
                                />
                                <IconFolder size={15} />
                                <span className="scope-name">{f.name}</span>
                                {whole && fWhole && <span className="scope-badge">ganzer Ordner · auch neue Decks</span>}
                              </label>
                              {fDecks.map((d) => deckRow(d, true))}
                            </div>
                          );
                        })}
                        {loose.map((d) => deckRow(d, false))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
        {!data.decks.length && <p className="muted small">Noch keine Decks vorhanden.</p>}
        {!!data.decks.length && term && !data.decks.some((d) => d.name.toLowerCase().includes(term) || data.courses.some((c) => c.id === d.courseId && c.name.toLowerCase().includes(term))) && (
          <p className="muted small">Nichts passt zu „{q}“.</p>
        )}
      </div>
    </div>
  );
}

/** Checklist of decks (for sessions): same clear layout, ticking a course or folder selects its decks. */
export function DeckPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  return <ScopePicker value={{ deckIds: value }} onChange={(v) => onChange(v.deckIds)} />;
}
