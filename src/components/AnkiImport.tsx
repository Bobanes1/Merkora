import { useEffect, useRef, useState } from 'react';
import { fromAnkiTags } from '../lib/marks';
import { useNavigate } from 'react-router-dom';
import type { AnkiResult } from '../lib/anki';
import { addCards, addCourse, addDeck, addWorkspace, deckUrl, getState, updateDeck, useData } from '../lib/store';
import { IconUpload } from './Icons';
import { ankiToSrs } from '../lib/srs';
import { Modal } from './Modal';

type Done = { decks: { id: string; name: string; count: number }[]; media: number; missing: number; skipped: number; into?: string; kept?: boolean };

export const isAnkiName = (name: string) => /\.(apkg|colpkg)$/i.test(name);
const baseNameOf = (name: string) => name.replace(/^.*[\\/]/, '').replace(/\.(apkg|colpkg)$/i, '');

/**
 * Puts imported Anki cards into the library.
 * - `targetDeckId`: all cards go into this existing deck.
 * - otherwise every Anki deck becomes its own deck in `courseId` (or a new course named after the file).
 */
export function storeImport(
  res: AnkiResult,
  opts: { fileName: string; targetDeckId?: string; courseId?: string; deckName?: string; /** keep Anki's learning progress */ keepProgress?: boolean },
) {
  const now = Date.now();
  const toNew = (c: AnkiResult['decks'][number]['cards'][number]) => ({
    front: c.front,
    back: c.back,
    html: true,
    styleId: c.styleId,
    cardClass: c.cardClass,
    ...fromAnkiTags(c.tags),
    ...(opts.keepProgress && c.progress ? { srs: ankiToSrs(c.progress, res.crt, now) } : {}),
  });
  const target = opts.targetDeckId ? getState().data.decks.find((d) => d.id === opts.targetDeckId) : undefined;
  if (target) {
    const cards = res.decks.flatMap((d) => d.cards.map(toNew));
    if (Object.keys(res.styles).length) updateDeck(target.id, (x) => ({ styles: { ...(x.styles ?? {}), ...res.styles } }));
    addCards(target.id, cards);
    return [{ id: target.id, name: target.name, count: cards.length }];
  }
  const baseName = baseNameOf(opts.fileName);
  let cid = opts.courseId;
  if (!cid || !getState().data.courses.some((c) => c.id === cid)) {
    const ws = getState().data.workspaces[0] ?? addWorkspace('Erster Workspace');
    cid = addCourse(ws.id, baseName || 'Anki-Import').id;
  }
  const single = res.decks.length === 1;
  return res.decks.map((d) => {
    const ankiName = /^(default|standard)$/i.test(d.name) ? baseName : d.name.split('::').join(' › ');
    const name = (single && opts.deckName?.trim()) || ankiName || 'Anki-Deck';
    // only the looks this deck's cards use
    const used = new Set(d.cards.map((c) => c.styleId).filter(Boolean) as string[]);
    const styles = Object.fromEntries(Object.entries(res.styles).filter(([k]) => used.has(k)));
    const deck = addDeck(cid!, name, Object.keys(styles).length ? { styles } : {});
    addCards(deck.id, d.cards.map(toNew));
    return { id: deck.id, name: deck.name, count: d.cards.length };
  });
}

/** Import Anki decks (.apkg) with their pictures, sounds and look. */
export function AnkiImport({
  onClose,
  courseId: presetCourse,
  targetDeckId,
  file: presetFile,
  path,
}: {
  onClose: () => void;
  courseId?: string;
  /** Import all cards into this deck. */
  targetDeckId?: string;
  /** A file dropped on the window … */
  file?: File;
  /** … or (desktop app) the path of a file opened with Merkora. These are imported right away. */
  path?: string;
}) {
  const data = useData();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(presetFile ?? null);
  const [courseId, setCourseId] = useState(presetCourse ?? '__new');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const [ask, setAsk] = useState<AnkiResult | null>(null);
  const target = targetDeckId ? data.decks.find((d) => d.id === targetDeckId) : undefined;
  const fileName = file?.name ?? path?.replace(/^.*[\\/]/, '') ?? '';

  const run = async () => {
    const src = file ?? path;
    if (!src) return;
    setError('');
    setBusy('Wird vorbereitet …');
    try {
      const { readApkg } = await import('../lib/anki');
      const res = await readApkg(src, setBusy);
      // The file has learning progress from Anki: the user decides every time whether to keep it.
      if (res.withProgress > 0) setAsk(res);
      else finish(res, false);
    } catch (e) {
      setError(`Import fehlgeschlagen: ${(e as Error).message ?? e}`);
    } finally {
      setBusy('');
    }
  };
  const finish = (res: AnkiResult, keepProgress: boolean) => {
    setAsk(null);
    const created = storeImport(res, { fileName, targetDeckId: target?.id, courseId: courseId === '__new' ? undefined : courseId, keepProgress });
    setDone({ decks: created, media: res.media, missing: res.missingMedia, skipped: res.skipped, into: target?.name, kept: keepProgress });
  };

  const open = (id: string, tab = 'cards') => {
    const st = getState().data;
    const deck = st.decks.find((d) => d.id === id);
    onClose();
    if (deck) navigate(deckUrl(st, deck, tab));
  };

  const started = useRef(false);
  useEffect(() => {
    if ((presetFile || path) && !started.current) {
      started.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (ask) return <ProgressQuestion res={ask} onAnswer={(keep) => finish(ask, keep)} onClose={onClose} />;

  if (done)
    return (
      <Modal
        title="Anki-Import abgeschlossen"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => open(done.decks[0].id, 'cards')}>
              Karten ansehen
            </button>
            <button type="button" className="btn primary" onClick={() => open(done.decks[0].id, 'learn')}>
              Jetzt lernen
            </button>
          </>
        }
      >
        <p>
          <b>{done.decks.reduce((a, d) => a + d.count, 0)} Karten</b>{' '}
          {done.into ? `zum Deck „${done.into}“ hinzugefügt` : `in ${done.decks.length} ${done.decks.length === 1 ? 'Deck' : 'Decks'} importiert`}
          {done.media ? `, dazu ${done.media} Bilder, Töne und Schriften` : ''}.
        </p>
        {!done.into && (
          <ul className="import-list">
            {done.decks.map((d) => (
              <li key={d.id}>
                <button type="button" className="link-btn" onClick={() => open(d.id)}>
                  {d.name}
                </button>{' '}
                <span className="muted">· {d.count} Karten</span>
              </li>
            ))}
          </ul>
        )}
        {done.missing > 0 && <p className="muted small">{done.missing} Medien-Dateien fehlten in der Datei und werden nicht angezeigt.</p>}
        {done.skipped > 0 && <p className="muted small">{done.skipped} leere oder unlesbare Karten wurden übersprungen.</p>}
        <p className="muted small">
          {done.kept ? 'Der Lernfortschritt aus Anki wurde übernommen.' : 'Alle Karten starten als neu – du beginnst ohne übernommenen Lernfortschritt.'}
        </p>
      </Modal>
    );

  return (
    <Modal
      title={target ? `Anki-Stapel in „${target.name}“ importieren` : 'Anki-Stapel importieren'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={!!busy}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={run} disabled={(!file && !path) || !!busy}>
            {busy || 'Importieren'}
          </button>
        </>
      }
    >
      <AnkiDropzone file={file} onFile={setFile} inputRef={fileRef} />
      {!target && (
        <>
          <label className="field-label" htmlFor="anki-course">
            Importieren in
          </label>
          <select id="anki-course" className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="__new">Neuer Kurs{fileName ? ` „${baseNameOf(fileName)}“` : ''}</option>
            {data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {data.workspaces.find((w) => w.id === c.workspaceId)?.name} › {c.name}
              </option>
            ))}
          </select>
        </>
      )}
      <p className="muted small">
        Bilder, Töne, Schriften, Formeln, Lückentexte, Bildverdeckungen (Image Occlusion) und das Aussehen der Kartentypen werden
        übernommen. {target ? 'Alle Karten kommen in dieses Deck.' : 'Jedes Anki-Deck wird ein eigenes Deck.'}
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}

/** Area to drop or choose an .apkg file. */
export function AnkiDropzone({
  file,
  onFile,
  inputRef,
}: {
  file: File | null;
  onFile: (f: File) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div
      className="dropzone"
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = Array.from(e.dataTransfer.files).find((x) => isAnkiName(x.name));
        if (f) onFile(f);
      }}
    >
      <IconUpload size={26} />
      <b>{file ? `„${file.name}“ ausgewählt` : '.apkg-Datei hierher ziehen'}</b>
      <span>oder klicken, um eine Datei auszuwählen. In Anki: „Datei › Exportieren › Anki-Stapelpaket“. Die Datei bleibt auf deinem Gerät.</span>
      <input
        ref={inputRef}
        type="file"
        accept=".apkg,.colpkg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

/** Asked on every Anki import whose file contains learning progress. */
export function ProgressQuestion({ res, onAnswer, onClose }: { res: AnkiResult; onAnswer: (keep: boolean) => void; onClose: () => void }) {
  const total = res.decks.reduce((a, d) => a + d.cards.length, 0);
  return (
    <Modal
      title="Lernfortschritt aus Anki übernehmen?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn outline" onClick={() => onAnswer(false)}>
            Nein, alle Karten neu lernen
          </button>
          <button type="button" className="btn primary" onClick={() => onAnswer(true)}>
            Ja, Fortschritt übernehmen
          </button>
        </>
      }
    >
      <p>
        <b>{res.withProgress}</b> von {total} Karten hast du in Anki schon gelernt.
      </p>
      <ul className="muted small">
        <li>
          <b>Übernehmen:</b> Intervalle und Fälligkeiten bleiben wie in Anki – du machst nahtlos weiter.
        </li>
        <li>
          <b>Neu lernen:</b> Alle Karten starten wieder bei null.
        </li>
      </ul>
    </Modal>
  );
}
