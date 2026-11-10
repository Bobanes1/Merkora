import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDeck, deckUrl, getState, type Course } from '../lib/store';
import { AnkiDropzone, ProgressQuestion, storeImport } from './AnkiImport';
import type { AnkiResult } from '../lib/anki';
import { IconCards, IconSparkle, IconUpload } from './Icons';
import { Modal } from './Modal';

type Start = 'empty' | 'ai' | 'anki';

/** New deck: start empty, let the AI create cards, or take the cards from an Anki package. */
export function NewDeckModal({ course, onClose, onAi }: { course: Course; onClose: () => void; onAi: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [start, setStart] = useState<Start>('empty');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ask, setAsk] = useState<AnkiResult | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const go = (deckId: string, tab = 'cards') => {
    const st = getState().data;
    const d = st.decks.find((x) => x.id === deckId);
    onClose();
    if (d) navigate(deckUrl(st, d, tab));
  };

  const submit = async () => {
    setError('');
    if (start === 'ai') {
      onClose();
      onAi();
      return;
    }
    if (start === 'empty') {
      if (!name.trim()) return;
      go(addDeck(course.id, name.trim()).id);
      return;
    }
    if (!file) return;
    setBusy('Wird vorbereitet …');
    try {
      const { readApkg } = await import('../lib/anki');
      const res = await readApkg(file, setBusy);
      if (res.withProgress > 0) setAsk(res);
      else go(storeImport(res, { fileName: file.name, courseId: course.id, deckName: name })[0].id);
    } catch (e) {
      setError(`Import fehlgeschlagen: ${(e as Error).message ?? e}`);
    } finally {
      setBusy('');
    }
  };

  if (ask && file)
    return (
      <ProgressQuestion
        res={ask}
        onClose={onClose}
        onAnswer={(keep) => go(storeImport(ask, { fileName: file.name, courseId: course.id, deckName: name, keepProgress: keep })[0].id)}
      />
    );

  const can = start === 'ai' || (start === 'empty' ? !!name.trim() : !!file);
  const options: { id: Start; icon: JSX.Element; title: string; text: string }[] = [
    { id: 'empty', icon: <IconCards size={18} />, title: 'Leer starten', text: 'Karten selbst schreiben.' },
    { id: 'ai', icon: <IconSparkle size={18} />, title: 'Mit KI erstellen', text: 'Aus PDF, Text oder Notizen.' },
    { id: 'anki', icon: <IconUpload size={18} />, title: 'Aus Anki-Stapel', text: '.apkg mit Bildern und Aussehen.' },
  ];

  return (
    <Modal
      title="Neues Deck"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={!!busy}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={submit} disabled={!can || !!busy}>
            {busy || (start === 'anki' ? 'Importieren' : start === 'ai' ? 'Weiter' : 'Erstellen')}
          </button>
        </>
      }
    >
      <div className="start-choice" role="radiogroup" aria-label="Wie möchtest du starten?">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={start === o.id}
            className={`start-option ${start === o.id ? 'on' : ''}`}
            onClick={() => setStart(o.id)}
          >
            {o.icon}
            <b>{o.title}</b>
            <small>{o.text}</small>
          </button>
        ))}
      </div>
      {start !== 'ai' && (
        <>
          <label className="field-label" htmlFor="deck-name">
            Name des Decks{start === 'anki' ? ' (optional – sonst der Name aus Anki)' : ''}
          </label>
          <input
            id="deck-name"
            ref={nameRef}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && can && void submit()}
          />
        </>
      )}
      {start === 'anki' && (
        <>
          <AnkiDropzone file={file} onFile={setFile} inputRef={fileRef} />
          <p className="muted small">Enthält der Stapel mehrere Anki-Decks, wird jedes ein eigenes Deck in „{course.name}“.</p>
        </>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
