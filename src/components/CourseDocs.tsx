import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hasKey } from '../lib/ai';
import type { CardDensity } from '../lib/cardCount';
import { splitMaterial } from '../lib/chunks';
import { estimate } from '../lib/costs';
import { combineMaterialsText, fileSize, stemOfName, unifiedCourseMaterials, type ModuleMaterialItem } from '../lib/courseDocs';
import { addCourseTextNote, linkExistingFilesToDeck, materialAsDeckFile, uploadCourseFiles } from '../lib/deckFiles';
import { FILE_KIND_LABEL, fileKind } from '../lib/fileKind';
import { MATERIAL_ACCEPT } from '../lib/files';
import { pushToast, startCardJobs } from '../lib/jobs';
import {
  addDeck,
  deckUrl,
  getState,
  removeCourseMaterial,
  setSettings,
  useData,
  type Course,
  type DeckFile,
} from '../lib/store';
import { CostHint } from './CostHint';
import { CreateWithAI } from './CreateWithAI';
import { FileViewer } from './FileViewer';
import { IconCards, IconDoc, IconNote, IconPlus, IconSparkle, IconTrash, IconUpload } from './Icons';
import { Modal } from './Modal';
import { StartSkillModal } from './StartSkillModal';

/**
 * Modul-Materialbox: upload PDFs, PowerPoints, Word docs or notes once into a course/module,
 * then separately create Flashcard Decks OR a Skill from any selected subset without re-uploading.
 */
export function CourseDocs({ course }: { course: Course }) {
  const data = useData();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => unifiedCourseMaterials(course, data.decks), [course, data.decks]);
  const [selected, setSelected] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');

  const [openFile, setOpenFile] = useState<{ file: DeckFile; deckId?: string } | null>(null);
  const [aiDeckItems, setAiDeckItems] = useState<ModuleMaterialItem[] | null>(null);
  const [deckChoice, setDeckChoice] = useState<ModuleMaterialItem[] | null>(null);
  const [skillItems, setSkillItems] = useState<ModuleMaterialItem[] | null>(null);

  const validKeys = useMemo(() => new Set(items.map((x) => x.key)), [items]);
  const pickedKeys = selected.filter((k) => validKeys.has(k));
  const picked = items.filter((x) => pickedKeys.includes(x.key));
  const allPicked = items.length > 0 && pickedKeys.length === items.length;

  const toggleKey = (key: string) => {
    setSelected((cur) => (cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]));
  };

  const toggleAll = () => {
    setSelected(allPicked ? [] : items.map((x) => x.key));
  };

  const handleFiles = async (list: FileList | File[] | null) => {
    const all = Array.from(list ?? []);
    if (!all.length) return;
    setError('');
    setBusy(all.length > 1 ? `1 von ${all.length} Dateien wird gelesen …` : 'Datei wird gelesen …');
    try {
      const res = await uploadCourseFiles(course.id, all, (i, total, _name, detail) => {
        const prefix = total > 1 ? `(${i + 1}/${total}) ` : '';
        setBusy(detail ? `${prefix}${detail}` : total > 1 ? `Datei ${i + 1} von ${total} wird gelesen …` : 'Datei wird gelesen …');
      });
      if (res.added.length) {
        const addedKeys = res.added.map((m) => `mat:${m.id}`);
        setSelected((cur) => [...new Set([...cur, ...addedKeys])]);
      }
      if (res.failed.length) setError(res.failed.join('\n'));
    } catch (e) {
      setError((e as Error).message || 'Dateien konnten nicht geladen werden.');
    } finally {
      setBusy('');
    }
  };

  const saveNote = () => {
    const saved = addCourseTextNote(course.id, noteTitle, noteText);
    if (!saved) return;
    setSelected((cur) => [...new Set([...cur, `mat:${saved.id}`])]);
    setNoteTitle('');
    setNoteText('');
    setAddingNote(false);
  };

  const onCreateDecks = () => {
    if (!picked.length) return;
    if (picked.length === 1 && hasKey()) {
      setAiDeckItems(picked);
    } else {
      setDeckChoice(picked);
    }
  };

  const openDeck = openFile?.deckId ? data.decks.find((d) => d.id === openFile.deckId) : undefined;

  return (
    <div className="course-docs">
      <div
        className={`mbox-drop${dragOver ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="mbox-drop-text">
          <b>Modul-Materialbox</b>
          <small className="muted">
            PDFs (auch Scans per Offline-OCR), Fotos, PowerPoint, Word oder Skripte hier ablegen – daraus separat Kartendecks oder einen Skill erstellen.
          </small>
        </div>
        <div className="mbox-drop-actions">
          <button type="button" className="btn primary sm" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>
            <IconUpload size={14} /> {busy || 'Dateien hochladen'}
          </button>
          <button type="button" className="btn outline sm" onClick={() => setAddingNote((v) => !v)}>
            <IconPlus size={14} /> Text / Notiz
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept={MATERIAL_ACCEPT}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {addingNote && (
        <div className="mbox-note-form">
          <input
            className="input"
            placeholder="Titel (z. B. Vorlesung 3 – Zusammenfassung)"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
          />
          <textarea
            className="input"
            rows={4}
            placeholder="Skript-Auszug oder eigene Notizen hier einfügen …"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="row-gap">
            <button type="button" className="btn primary sm" disabled={!noteText.trim()} onClick={saveNote}>
              Im Modul speichern
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setAddingNote(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {items.length > 0 ? (
        <>
          <div className="mbox-toolbar">
            <label className="check-row mbox-sel-all">
              <input type="checkbox" checked={allPicked} onChange={toggleAll} />
              <span>
                {picked.length > 0
                  ? `${picked.length} von ${items.length} ausgewählt`
                  : `${items.length} ${items.length === 1 ? 'Datei / Notiz' : 'Dateien & Notizen'} im Modul`}
              </span>
            </label>
            {picked.length > 0 && (
              <div className="mbox-action-btns">
                <button type="button" className="btn primary sm" onClick={onCreateDecks}>
                  <IconCards size={14} /> Kartendeck{picked.length > 1 ? 's' : ''} erstellen
                </button>
                <button type="button" className="btn outline sm" onClick={() => setSkillItems(picked)}>
                  <IconSparkle size={14} /> Skill erstellen
                </button>
              </div>
            )}
          </div>

          <ul className="doc-list mbox-list">
            {items.map((it) => {
              const checked = pickedKeys.includes(it.key);
              const k = it.isFile ? fileKind(it.name, it.type ?? 'application/pdf') : 'text';
              const df = materialAsDeckFile(it);
              return (
                <li key={it.key} className={`mbox-row${checked ? ' checked' : ''}`}>
                  <input
                    type="checkbox"
                    className="mbox-check"
                    checked={checked}
                    aria-label={`${it.name} auswählen`}
                    onChange={() => toggleKey(it.key)}
                  />
                  {df ? (
                    <button
                      type="button"
                      className="doc-item grow"
                      onClick={() => setOpenFile({ file: df, deckId: it.deckId })}
                    >
                      <span className={'file-ico k-' + k}>
                        <IconDoc size={16} />
                      </span>
                      <span className="doc-text">
                        <b title={it.name}>{it.name}</b>
                        <small className="muted">
                          {FILE_KIND_LABEL[k]} · {fileSize(it.size)}
                          {it.text.length > 0 ? ` · ${it.text.length.toLocaleString('de-DE')} Zeichen` : ''}
                          {it.origin === 'deck' && it.deckName ? ` · aus Deck „${it.deckName}“` : ' · Modul'}
                        </small>
                      </span>
                    </button>
                  ) : it.deckId ? (
                    <Link
                      to={deckUrl(data, data.decks.find((x) => x.id === it.deckId)!, 'source')}
                      className="doc-item grow"
                    >
                      <span className="file-ico k-text">
                        <IconNote size={16} />
                      </span>
                      <span className="doc-text">
                        <b title={it.name}>{it.name}</b>
                        <small className="muted">
                          Notiz · {it.text.length.toLocaleString('de-DE')} Zeichen
                          {it.folder ? ` · ${it.folder}` : ''}
                        </small>
                      </span>
                    </Link>
                  ) : (
                    <div className="doc-item grow static">
                      <span className="file-ico k-text">
                        <IconNote size={16} />
                      </span>
                      <span className="doc-text">
                        <b title={it.name}>{it.name}</b>
                        <small className="muted">Notiz · {it.text.length.toLocaleString('de-DE')} Zeichen · Modul</small>
                      </span>
                    </div>
                  )}
                  {it.origin === 'course' && (
                    <button
                      type="button"
                      className="icon-btn sm"
                      title="Aus Modul-Materialbox entfernen"
                      aria-label={`${it.name} entfernen`}
                      onClick={() => removeCourseMaterial(course.id, it.id)}
                    >
                      <IconTrash size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          Noch keine Dateien in diesem Modul. Ziehe einfach deine Vorlesungsfolien, PDFs oder Skripte oben hinein.
        </p>
      )}

      {openFile && <FileViewer file={openFile.file} deck={openDeck} onClose={() => setOpenFile(null)} />}

      {aiDeckItems && (
        <CreateWithAI
          courseId={course.id}
          initialTitle={aiDeckItems.length === 1 ? stemOfName(aiDeckItems[0].name) : course.name}
          initialMaterials={aiDeckItems.map((m) => ({
            name: m.name,
            text: m.text,
            file: materialAsDeckFile(m) ?? undefined,
          }))}
          onClose={() => setAiDeckItems(null)}
        />
      )}

      {deckChoice && (
        <CourseDecksChoiceModal
          course={course}
          items={deckChoice}
          onClose={() => setDeckChoice(null)}
          onOpenCombined={(sel) => {
            setDeckChoice(null);
            setAiDeckItems(sel);
          }}
          onDoneEmpty={(deck) => {
            setDeckChoice(null);
            if (deck) navigate(deckUrl(getState().data, deck, 'source'));
          }}
        />
      )}

      {skillItems && (
        <StartSkillModal
          initialTopic={skillItems.length === 1 ? stemOfName(skillItems[0].name) : course.name}
          material={combineMaterialsText(skillItems, 60000)}
          files={skillItems.map((m) => materialAsDeckFile(m)).filter((f): f is DeckFile => f !== null)}
          courseId={course.id}
          onClose={() => setSkillItems(null)}
        />
      )}
    </div>
  );
}

/** Choice dialog when creating flashcard deck(s) from multiple selected module materials (or without API key). */
function CourseDecksChoiceModal({
  course,
  items,
  onClose,
  onOpenCombined,
  onDoneEmpty,
}: {
  course: Course;
  items: ModuleMaterialItem[];
  onClose: () => void;
  onOpenCombined: (items: ModuleMaterialItem[]) => void;
  onDoneEmpty: (firstDeck?: ReturnType<typeof addDeck>) => void;
}) {
  const data = useData();
  const [mode, setMode] = useState<'single' | 'per-file'>(items.length > 1 ? 'per-file' : 'single');
  const [density, setDensityState] = useState<CardDensity>(data.settings.cardDensity ?? 'compact');
  const [folderId, setFolderId] = useState('');
  const setDensity = (d: CardDensity) => {
    setDensityState(d);
    setSettings({ cardDensity: d });
  };

  const withText = items.filter((x) => x.text.trim().length > 0);
  const aiReady = hasKey() && withText.length > 0;
  const folders = course.folders ?? [];
  const graphics = data.settings.cardGraphics !== false;

  const est = useMemo(() => {
    if (!aiReady || mode !== 'per-file') return null;
    const allLengths = withText.flatMap((it) => splitMaterial([{ name: it.name, text: it.text }]).map((p) => p.text.length));
    return estimate.cardsParts(allLengths, allLengths.map(() => 0), graphics, 1600, [], density);
  }, [aiReady, mode, withText, graphics, density]);

  const startPerFileAi = () => {
    let created = 0;
    for (const it of withText) {
      const deck = addDeck(course.id, stemOfName(it.name), {
        source: it.text,
        ...(folderId ? { folderId } : {}),
      });
      const df = materialAsDeckFile(it);
      if (df) linkExistingFilesToDeck(deck.id, [df]);
      const fresh = getState().data.decks.find((d) => d.id === deck.id)!;
      const parts = splitMaterial([{ name: it.name, text: it.text }]);
      startCardJobs(
        fresh,
        parts.map((p) => p.text),
        { counts: parts.map(() => 0), focus: '', graphics, density },
      );
      created++;
    }
    pushToast({
      text: `${created} Kartendecks werden im Hintergrund erstellt – du kannst einfach weiterlernen.`,
      ok: true,
    });
    onClose();
  };

  const createEmptyWithMaterial = () => {
    if (mode === 'per-file' && items.length > 1) {
      let first: ReturnType<typeof addDeck> | undefined;
      for (const it of items) {
        const deck = addDeck(course.id, stemOfName(it.name), {
          source: it.text,
          ...(folderId ? { folderId } : {}),
        });
        const df = materialAsDeckFile(it);
        if (df) linkExistingFilesToDeck(deck.id, [df]);
        if (!first) first = deck;
      }
      pushToast({ text: `${items.length} Decks mit Material in „${course.name}“ angelegt.`, ok: true });
      onDoneEmpty();
    } else {
      const title = items.length === 1 ? stemOfName(items[0].name) : course.name;
      const deck = addDeck(course.id, title, {
        source: combineMaterialsText(items),
        ...(folderId ? { folderId } : {}),
      });
      const dfs = items.map((m) => materialAsDeckFile(m)).filter((f): f is DeckFile => f !== null);
      linkExistingFilesToDeck(deck.id, dfs);
      onDoneEmpty(deck);
    }
  };

  return (
    <Modal
      title="Kartendecks aus Modul-Material erstellen"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn outline" onClick={createEmptyWithMaterial}>
            Nur mit Material anlegen (ohne KI)
          </button>
          {aiReady && (
            <button
              type="button"
              className="btn primary"
              onClick={() => (mode === 'single' ? onOpenCombined(items) : startPerFileAi())}
            >
              <IconSparkle size={14} />{' '}
              {mode === 'single' ? 'Weiter zu KI-Optionen' : `${withText.length} Decks im Hintergrund erstellen`}
            </button>
          )}
        </>
      }
    >
      <div className="stack-gap">
        <p className="muted small" style={{ margin: 0 }}>
          {items.length} {items.length === 1 ? 'Eintrag' : 'Dateien / Notizen'} ausgewählt. Dateien werden verknüpft, ohne Speicherplatz doppelt zu belegen.
        </p>

        {items.length > 1 && (
          <div className="seg" role="radiogroup" aria-label="Aufteilung">
            <button type="button" role="radio" aria-checked={mode === 'per-file'} className={mode === 'per-file' ? 'on' : ''} onClick={() => setMode('per-file')}>
              1 Deck pro Datei ({items.length} Decks)
            </button>
            <button type="button" role="radio" aria-checked={mode === 'single'} className={mode === 'single' ? 'on' : ''} onClick={() => setMode('single')}>
              1 gemeinsames Deck
            </button>
          </div>
        )}

        {folders.length > 0 && mode === 'per-file' && (
          <div>
            <label className="field-label" htmlFor="mbox-folder">
              Ziel-Ordner im Modul (optional)
            </label>
            <select id="mbox-folder" className="input" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">Direkt im Modul „{course.name}“</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {aiReady && mode === 'per-file' && (
          <>
            <div>
              <span className="field-label">Kartendichte</span>
              <div className="seg compact" role="radiogroup" aria-label="Kartendichte">
                <button type="button" role="radio" aria-checked={density === 'compact'} className={density === 'compact' ? 'on' : ''} onClick={() => setDensity('compact')}>
                  Kompakt (Kernthemen)
                </button>
                <button type="button" role="radio" aria-checked={density === 'thorough'} className={density === 'thorough' ? 'on' : ''} onClick={() => setDensity('thorough')}>
                  Ausführlich (alle Details)
                </button>
              </div>
            </div>
            {est && <CostHint est={est} />}
          </>
        )}

        {!hasKey() && (
          <p className="muted small" style={{ margin: 0 }}>
            Kein KI-Schlüssel hinterlegt – du kannst die Decks trotzdem direkt mit dem Material anlegen und Karten selbst erstellen.
          </p>
        )}
      </div>
    </Modal>
  );
}
