import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addCourse, addDeck, addWorkspace, deckUrl, getState, moveDeck, useData, type Course } from '../lib/store';
import { AnkiDropzone, ProgressQuestion, storeImport } from './AnkiImport';
import type { AnkiResult } from '../lib/anki';
import { IconCards, IconHeart, IconSparkle, IconUpload } from './Icons';
import { importShare } from './ShareDialog';
import { parseShare, SHARE_EXT } from '../lib/share';
import { Modal } from './Modal';

type Start = 'empty' | 'ai' | 'anki' | 'share';

/** New deck: start empty, let the AI create cards, or take the cards from an Anki package. */
export function NewDeckModal({
  course: presetCourse,
  folderId: presetFolder,
  onClose,
  onAi,
}: {
  /** Without a course (e.g. from the sidebar) the user picks one in the dialog. */
  course?: Course;
  folderId?: string;
  onClose: () => void;
  onAi: (courseId: string) => void;
}) {
  const navigate = useNavigate();
  const data = useData();
  const [courseId, setCourseId] = useState(presetCourse?.id ?? data.courses[0]?.id ?? '');
  const [folderId, setFolderId] = useState(presetFolder ?? '');
  const course = data.courses.find((c) => c.id === courseId);
  /** The chosen course – created if there is none yet. */
  const ensureCourse = () => {
    if (course) return course;
    const ws = getState().data.workspaces[0] ?? addWorkspace('Erster Workspace');
    return addCourse(ws.id, 'Erster Kurs');
  };
  const placeIn = (deckIds: string[]) => {
    if (folderId) deckIds.forEach((id) => moveDeck(id, folderId));
  };
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
      onAi(ensureCourse().id);
      return;
    }
    if (start === 'empty') {
      if (!name.trim()) return;
      const d = addDeck(ensureCourse().id, name.trim(), folderId ? { folderId } : {});
      go(d.id);
      return;
    }
    if (!file) return;
    if (start === 'share') {
      try {
        const pack = parseShare(await file.text());
        const d = importShare(pack, ensureCourse().id, name);
        placeIn([d.id]);
        go(d.id, pack.exam ? 'exam' : 'cards');
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    setBusy('Wird vorbereitet …');
    try {
      const { readApkg } = await import('../lib/anki');
      const res = await readApkg(file, setBusy);
      if (res.withProgress > 0) setAsk(res);
      else {
        const created = storeImport(res, { fileName: file.name, courseId: ensureCourse().id, deckName: name });
        placeIn(created.map((c) => c.id));
        go(created[0].id);
      }
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
        onAnswer={(keep) => {
          const created = storeImport(ask, { fileName: file.name, courseId: ensureCourse().id, deckName: name, keepProgress: keep });
          placeIn(created.map((c) => c.id));
          go(created[0].id);
        }}
      />
    );

  const can = start === 'ai' || (start === 'empty' ? !!name.trim() : !!file);
  const options: { id: Start; icon: JSX.Element; title: string; text: string }[] = [
    { id: 'empty', icon: <IconCards size={18} />, title: 'Leer starten', text: 'Karten selbst schreiben.' },
    { id: 'ai', icon: <IconSparkle size={18} />, title: 'Mit KI erstellen', text: 'Aus PDF, Word, PowerPoint oder Notizen.' },
    { id: 'anki', icon: <IconUpload size={18} />, title: 'Aus Anki-Stapel', text: '.apkg mit Bildern und Aussehen.' },
    { id: 'share', icon: <IconHeart size={18} />, title: 'Von Freunden', text: `Geteilte ${SHARE_EXT}-Datei, oft mit Probeprüfung.` },
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
            {busy || (start === 'anki' || start === 'share' ? 'Importieren' : start === 'ai' ? 'Weiter' : 'Erstellen')}
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
      {data.courses.length > 0 && (
        <div className="form-grid">
          <div>
            <label className="field-label" htmlFor="deck-course">
              Kurs
            </label>
            <select
              id="deck-course"
              className="input"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setFolderId('');
              }}
            >
              {data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {data.workspaces.find((w) => w.id === c.workspaceId)?.name} › {c.name}
                </option>
              ))}
            </select>
          </div>
          {start !== 'ai' && (course?.folders?.length ?? 0) > 0 && (
            <div>
              <label className="field-label" htmlFor="deck-folder">
                Ordner
              </label>
              <select id="deck-folder" className="input" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">– kein Ordner –</option>
                {course!.folders!.map((fo) => (
                  <option key={fo.id} value={fo.id}>
                    {fo.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      {start !== 'ai' && (
        <>
          <label className="field-label" htmlFor="deck-name">
            Name des Decks{start === 'anki' ? ' (optional – sonst der Name aus Anki)' : start === 'share' ? ' (optional – sonst der Name aus der Datei)' : ''}
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
      {start === 'share' && (
        <div className="share-pick">
          <label className="field-label" htmlFor="share-file">
            Datei von Freunden
          </label>
          <input id="share-file" type="file" accept={`${SHARE_EXT},.json`} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="muted small">Das Deck kommt in „{course?.name ?? 'Erster Kurs'}“. Ist eine Probeprüfung dabei, kannst du sie gleich schreiben und mit deinen Freunden vergleichen.</p>
        </div>
      )}
      {start === 'anki' && (
        <>
          <AnkiDropzone file={file} onFile={setFile} inputRef={fileRef} />
          <p className="muted small">Enthält der Stapel mehrere Anki-Decks, wird jedes ein eigenes Deck in „{course?.name ?? 'Erster Kurs'}“.</p>
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
