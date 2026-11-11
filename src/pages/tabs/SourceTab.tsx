import { useEffect, useRef, useState } from 'react';
import { CreateWithAI } from '../../components/CreateWithAI';
import { IconSparkle, IconUpload } from '../../components/Icons';
import { MATERIAL_ACCEPT, readFileText } from '../../lib/files';
import { updateDeck, type Deck } from '../../lib/store';

export default function SourceTab({ deck }: { deck: Deck }) {
  const [text, setText] = useState(deck.source);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ai, setAi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => {
      updateDeck(deck.id, { source: text });
      setSaved(true);
    }, 600);
    return () => clearTimeout(t);
  }, [text, saved, deck.id]);

  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      const t = await readFileText(f);
      setText((prev) => (prev.trim() ? prev + '\n\n' : '') + t);
      setSaved(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel source">
      <div className="toolbar">
        <div>
          <b className="toolbar-title">Lernmaterial</b>
          <p className="muted small">Grundlage für Zusammenfassung, Quiz und Tutor. {saved ? 'Gespeichert.' : 'Wird gespeichert …'}</p>
        </div>
        <span className="grow" />
        <button type="button" className="btn outline sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          <IconUpload size={15} /> {busy ? 'Wird gelesen …' : 'Datei hinzufügen'}
        </button>
        <button type="button" className="btn primary sm" onClick={() => setAi(true)} disabled={text.trim().length < 40}>
          <IconSparkle size={15} /> Karten daraus erstellen
        </button>
        <input ref={fileRef} type="file" hidden accept={MATERIAL_ACCEPT} onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <textarea
        className="input source-text"
        rows={18}
        placeholder="Füge hier Notizen, Skript-Auszüge oder Text aus PDF, Word oder PowerPoint ein …"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
      />
      <p className="muted small">{text.length.toLocaleString('de-DE')} Zeichen</p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {ai && <CreateWithAI deckId={deck.id} onClose={() => setAi(false)} />}
    </div>
  );
}
