import { useMemo, useRef, useState } from 'react';
import { duplicateKey, parseTextImport, type ParsedImportCard, type TextDelimiter } from '../lib/deckTools';
import { addCards, type Deck } from '../lib/store';
import { parseTags } from '../lib/tags';
import { IconUpload } from './Icons';
import { Modal } from './Modal';

const DELIMS: { id: TextDelimiter; label: string }[] = [
  { id: 'auto', label: 'Automatisch' },
  { id: 'tab', label: 'Tab (Quizlet / Excel)' },
  { id: 'semicolon', label: 'Semikolon (;)' },
  { id: 'comma', label: 'Komma (,)' },
  { id: 'colon', label: 'Doppelpunkt (::)' },
  { id: 'dash', label: 'Bindestrich ( - )' },
];

/**
 * Paste or upload CSV, TSV (Quizlet/Excel) or Markdown lists and import them as flashcards.
 * Works both directly into an existing deck or via `onImport` callback (e.g. from NewDeckModal).
 */
export function TextImportModal({
  deck,
  onClose,
  onImport,
}: {
  deck?: Deck;
  onClose: () => void;
  onImport?: (cards: ParsedImportCard[]) => void;
}) {
  const [raw, setRaw] = useState('');
  const [delim, setDelim] = useState<TextDelimiter>('auto');
  const [tagText, setTagText] = useState('');
  const [skipDup, setSkipDup] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const extraTags = useMemo(() => parseTags(tagText), [tagText]);
  const parsed = useMemo(() => parseTextImport(raw, { delimiter: delim, extraTags }), [raw, delim, extraTags]);

  const existingKeys = useMemo(() => {
    const s = new Set<string>();
    if (deck) for (const c of deck.cards) s.add(duplicateKey(c));
    return s;
  }, [deck]);

  const { toAdd, skipped } = useMemo(() => {
    if (!skipDup) return { toAdd: parsed, skipped: 0 };
    const seen = new Set(existingKeys);
    const keep: ParsedImportCard[] = [];
    let dup = 0;
    for (const item of parsed) {
      const k = duplicateKey({ front: item.front });
      if (k && seen.has(k)) {
        dup++;
        continue;
      }
      if (k) seen.add(k);
      keep.push(item);
    }
    return { toAdd: keep, skipped: dup };
  }, [parsed, skipDup, existingKeys]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setRaw(await f.text());
  };

  const submit = () => {
    if (!toAdd.length) return;
    if (onImport) {
      onImport(toAdd);
    } else if (deck) {
      addCards(deck.id, toAdd);
    }
    onClose();
  };

  return (
    <Modal
      title="CSV / Text / Quizlet importieren"
      className="text-import-modal"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" disabled={!toAdd.length} onClick={submit}>
            {toAdd.length} {toAdd.length === 1 ? 'Karte' : 'Karten'} importieren
          </button>
        </>
      }
    >
      <p className="muted small">
        Füge kopierte Zeilen aus Quizlet, Excel, CSV oder Markdown-Listen ein – eine Karte pro Zeile (z. B. <code>Begriff ; Definition</code> oder Tab-getrennt).
      </p>

      <div className="row-gap">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.md"
          style={{ display: 'none' }}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button type="button" className="btn outline sm" onClick={() => fileRef.current?.click()}>
          <IconUpload size={14} /> Datei laden (.csv / .tsv / .txt)
        </button>
        <select className="input sm" aria-label="Trennzeichen" value={delim} onChange={(e) => setDelim(e.target.value as TextDelimiter)}>
          {DELIMS.map((d) => (
            <option key={d.id} value={d.id}>
              Trennzeichen: {d.label}
            </option>
          ))}
        </select>
      </div>

      <textarea
        className="input mono text-import-area"
        rows={8}
        placeholder={`Photosynthese ; Umwandlung von Lichtenergie in chemische Energie\nMitose ; Kernteilung zur Bildung zweier identischer Tochterzellen\nATP ; Universeller Energieträger der Zelle`}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />

      <div className="text-import-opts">
        <input
          className="input sm"
          placeholder="Optional: Tags für alle Karten (z. B. Kapitel1)"
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
        />
        <label className="check-row small">
          <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
          Doppelte überspringen {skipped > 0 ? `(${skipped})` : ''}
        </label>
      </div>

      {toAdd.length > 0 && (
        <div className="text-import-preview">
          <small className="muted">
            Vorschau: <b>{toAdd.length}</b> erkannte {toAdd.length === 1 ? 'Karte' : 'Karten'}
            {skipped > 0 && ` · ${skipped} Duplikate übersprungen`}
          </small>
          <table className="lang-table">
            <thead>
              <tr>
                <th>Vorderseite</th>
                <th>Rückseite</th>
              </tr>
            </thead>
            <tbody>
              {toAdd.slice(0, 6).map((c, i) => (
                <tr key={i}>
                  <td>{c.front}</td>
                  <td>{c.back}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {toAdd.length > 6 && <small className="muted">… und {toAdd.length - 6} weitere Karten.</small>}
        </div>
      )}
    </Modal>
  );
}
