import { useEffect, useState } from 'react';
import { addCards, useStore } from '../../lib/store';
import { toolWindows } from '../../lib/toolWindows';
import { Markdown } from '../Markdown';
import { IconCheck, IconEye, IconPlus, IconPopout, IconTrash } from '../Icons';

type Note = { id: string; title: string; body: string; updatedAt: number };

const STORE_KEY = 'merkora.scratchpad.v1';

function loadNotes(): Note[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Note[] | null;
    if (Array.isArray(raw) && raw.length) return raw;
  } catch {
    /* default below */
  }
  return [{ id: 'n1', title: 'Schmierzettel', body: '', updatedAt: Date.now() }];
}

/**
 * Markdown + LaTeX scratchpad for Merkora Tools & floating popup window.
 * Supports multiple notes, live preview, and 1-click saving as a flashcard into any deck.
 */
export function ScratchpadTool({ compact = false }: { compact?: boolean }) {
  const decks = useStore((s) => s.data.decks);
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [activeId, setActiveId] = useState<string>(() => notes[0]?.id ?? 'n1');
  const [preview, setPreview] = useState(false);
  const [deckId, setDeckId] = useState<string>(() => decks[0]?.id ?? '');
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(notes));
    } catch {
      /* ignore */
    }
  }, [notes]);

  const active = notes.find((n) => n.id === activeId) ?? notes[0];
  const patch = (upd: Partial<Note>) =>
    setNotes((list) => list.map((n) => (n.id === active.id ? { ...n, ...upd, updatedAt: Date.now() } : n)));

  const addNote = () => {
    const n: Note = { id: 'n_' + Math.random().toString(36).slice(2, 8), title: `Notiz ${notes.length + 1}`, body: '', updatedAt: Date.now() };
    setNotes((list) => [n, ...list]);
    setActiveId(n.id);
    setPreview(false);
  };

  const removeNote = (id: string) => {
    if (notes.length <= 1) {
      patch({ body: '', title: 'Schmierzettel' });
      return;
    }
    const rest = notes.filter((n) => n.id !== id);
    setNotes(rest);
    if (activeId === id) setActiveId(rest[0].id);
  };

  const insert = (snippet: string) => {
    patch({ body: active.body ? `${active.body}\n${snippet}` : snippet });
    setPreview(false);
  };

  const saveAsCard = () => {
    const targetDeck = deckId || decks[0]?.id;
    if (!targetDeck || !active.body.trim()) return;
    const lines = active.body.trim().split('\n').filter(Boolean);
    const front = active.title.trim() && active.title !== 'Schmierzettel' ? active.title.trim() : lines[0].replace(/^#+\s*/, '').slice(0, 140);
    const back = active.body.trim();
    addCards(targetDeck, [{ front, back }]);
    const dName = decks.find((d) => d.id === targetDeck)?.name ?? 'Deck';
    setSavedMsg(`Als Karte in „${dName}“ gespeichert!`);
    setTimeout(() => setSavedMsg(''), 2800);
  };

  return (
    <div className={`scratchpad ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="panel-head">
          <div>
            <h2>Schmierzettel &amp; Notizblock</h2>
            <p className="muted small">Schnell mitschreiben (Markdown &amp; LaTeX-Formeln wie <code>$a^2 + b^2 = c^2$</code>) oder direkt als Karteikarte sichern.</p>
          </div>
          <button type="button" className="btn outline sm" onClick={() => toolWindows.open('notes')}>
            <IconPopout size={14} /> Als Popup öffnen
          </button>
        </div>
      )}

      <div className="scratchpad-tabs">
        {notes.map((n) => (
          <button key={n.id} type="button" className={'chip' + (n.id === active.id ? ' on' : '')} onClick={() => setActiveId(n.id)}>
            {n.title || 'Ohne Titel'}
          </button>
        ))}
        <button type="button" className="chip" onClick={addNote} title="Neue Notiz">
          <IconPlus size={12} /> Neu
        </button>
      </div>

      <div className="scratchpad-head">
        <input
          className="input sm scratchpad-title"
          value={active.title}
          placeholder="Titel der Notiz …"
          onChange={(e) => patch({ title: e.target.value })}
        />
        <button type="button" className={'btn sm ' + (preview ? 'primary' : 'ghost')} onClick={() => setPreview((v) => !v)} title="Markdown & Formeln anzeigen">
          <IconEye size={14} /> {compact ? '' : preview ? 'Bearbeiten' : 'Vorschau'}
        </button>
        <button type="button" className="icon-btn sm" onClick={() => removeNote(active.id)} title="Notiz löschen" aria-label="Notiz löschen">
          <IconTrash size={14} />
        </button>
      </div>

      {!compact && !preview && (
        <div className="chips">
          <button type="button" className="chip" onClick={() => insert('**Merksatz:** ')}>+ Merksatz</button>
          <button type="button" className="chip" onClick={() => insert('$$a^2 + b^2 = c^2$$')}>+ Formel</button>
          <button type="button" className="chip" onClick={() => insert('- [ ] ')}>+ Checkliste</button>
        </div>
      )}

      {preview ? (
        <div className="scratchpad-preview md">
          {active.body.trim() ? <Markdown text={active.body} /> : <p className="muted small">Noch kein Text.</p>}
        </div>
      ) : (
        <textarea
          className="input scratchpad-area"
          rows={compact ? 8 : 11}
          placeholder="Hier frei mitschreiben, Nebenrechnungen notieren oder Formeln testen …"
          value={active.body}
          onChange={(e) => patch({ body: e.target.value })}
        />
      )}

      {decks.length > 0 && (
        <div className="scratchpad-foot">
          <select className="input sm" aria-label="Ziel-Deck" value={deckId || decks[0]?.id || ''} onChange={(e) => setDeckId(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn outline sm" disabled={!active.body.trim()} onClick={saveAsCard}>
            <IconCheck size={13} /> Als Karte speichern
          </button>
          {savedMsg && <small className="form-ok">{savedMsg}</small>}
        </div>
      )}
    </div>
  );
}
