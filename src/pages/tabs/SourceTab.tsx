import { useEffect, useRef, useState } from 'react';
import { CreateWithAI } from '../../components/CreateWithAI';
import { IconSparkle, IconUpload } from '../../components/Icons';
import { SlideViewer } from '../../components/SlideViewer';
import { attachPdfs } from '../../lib/deckFiles';
import { isPdf, MATERIAL_ACCEPT, readFileText } from '../../lib/files';
import { updateDeck, type Deck } from '../../lib/store';

export default function SourceTab({ deck }: { deck: Deck }) {
  const [text, setText] = useState(deck.source);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ai, setAi] = useState(false);
  /** PDFs picked while the deck already has text: show only as slides, or also add their text? */
  const [pending, setPending] = useState<File[] | null>(null);
  const hasFiles = (deck.files?.length ?? 0) > 0;
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => {
      updateDeck(deck.id, { source: text });
      setSaved(true);
    }, 600);
    return () => clearTimeout(t);
  }, [text, saved, deck.id]);

  const onFiles = (list?: FileList | null) => {
    const all = Array.from(list ?? []);
    if (!all.length) return;
    // material that is already there (e.g. from these slides): ask before adding the same text twice
    if (text.trim() && all.some(isPdf)) setPending(all);
    else void addFiles(all, true);
  };

  /** Keeps PDFs as slides and appends the text (of PDFs only if `pdfText`); a broken file does not stop the others. */
  const addFiles = async (all: File[], pdfText: boolean) => {
    setPending(null);
    setBusy(true);
    setError('');
    const failed: string[] = [];
    for (const f of all) {
      if (isPdf(f) && !pdfText) continue;
      try {
        const t = await readFileText(f);
        setText((prev) => (prev.trim() ? prev + '\n\n' : '') + t);
        setSaved(false);
      } catch (e) {
        failed.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    try {
      await attachPdfs(deck.id, all);
    } catch (e) {
      failed.push(`Präsentation konnte nicht gespeichert werden: ${(e as Error).message}`);
    }
    setBusy(false);
    if (failed.length) setError(failed.join('\n'));
  };

  const textArea = (
    <>
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
    </>
  );

  return (
    <div className="panel source">
      <div className="toolbar">
        <div>
          <b className="toolbar-title">Lernmaterial</b>
          <p className="muted small">Grundlage für Zusammenfassung, Quiz und Tutor. {saved ? 'Gespeichert.' : 'Wird gespeichert …'}</p>
        </div>
        <span className="grow" />
        <button type="button" className="btn outline sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          <IconUpload size={15} /> {busy ? 'Wird gelesen …' : 'Dateien hinzufügen'}
        </button>
        <button type="button" className="btn primary sm" onClick={() => setAi(true)} disabled={text.trim().length < 40}>
          <IconSparkle size={15} /> Karten daraus erstellen
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept={MATERIAL_ACCEPT}
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {pending && (
        <div className="form-warn source-ask">
          Im Lernmaterial steht schon Text. Sollen die Folien nur angezeigt werden, oder soll ihr Text zusätzlich angehängt werden?
          <div className="source-ask-actions">
            <button type="button" className="btn primary sm" onClick={() => void addFiles(pending, false)}>
              Nur Folien zeigen
            </button>
            <button type="button" className="btn outline sm" onClick={() => void addFiles(pending, true)}>
              Text auch anhängen
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setPending(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {hasFiles && <SlideViewer key={deck.id} deck={deck} />}
      {hasFiles ? (
        <details className="source-details">
          <summary>
            Herausgelesener Text <span className="muted small">· Grundlage für die KI · {text.length.toLocaleString('de-DE')} Zeichen</span>
          </summary>
          {textArea}
        </details>
      ) : (
        textArea
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {ai && <CreateWithAI deckId={deck.id} onClose={() => setAi(false)} />}
    </div>
  );
}
