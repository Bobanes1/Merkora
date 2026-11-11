import { autoCardCount, CARD_MATERIAL_LIMIT } from '../lib/cardCount';
import { CostHint } from './CostHint';
import { estimate } from '../lib/costs';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateCards, hasKey } from '../lib/ai';
import { MATERIAL_ACCEPT, MATERIAL_LABEL, readFileText } from '../lib/files';
import { canSurviveClose, startJob } from '../lib/jobs';
import { cleanSvg, withGraphics } from '../lib/graphics';
import { addCards, addCourse, addDeck, addWorkspace, deckUrl, getState, updateDeck, useData } from '../lib/store';
import { IconClose, IconDoc, IconSparkle, IconTrash, IconUpload } from './Icons';
import { Modal } from './Modal';
import { NoKeyNotice } from './NoKey';

type Draft = { front: string; back: string; svg?: string; keep: boolean };

/** Upload a PDF / paste notes → AI makes flashcards → review → save into a new or existing deck. */
export function CreateWithAI({
  onClose,
  deckId,
  courseId: presetCourse,
  onBack,
  initialNotes,
  initialFile,
}: {
  onClose: () => void;
  deckId?: string;
  courseId?: string;
  /** Shows a "Zurück" button (e.g. back to the "Neues Deck" choice). */
  onBack?: () => void;
  /** Text and/or file handed over from the start page. */
  initialNotes?: string;
  initialFile?: File;
}) {
  const data = useData();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const existing = deckId ? data.decks.find((d) => d.id === deckId) : undefined;
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [files, setFiles] = useState<{ id: number; name: string; text: string }[]>([]);
  const [useSource, setUseSource] = useState(false);
  const oldSource = existing?.source.trim() ?? '';
  // everything the AI should use: attached files, own notes and (if ticked) the deck's earlier material
  const text = [...files.map((x) => x.text), notes.trim(), useSource ? oldSource : ''].filter(Boolean).join('\n\n');
  const [name, setName] = useState('');
  // 0 = automatic (as many cards as the material needs)
  const [count, setCount] = useState(0);
  const [focus, setFocus] = useState('');
  const [graphics, setGraphics] = useState(false);
  const [courseId, setCourseId] = useState(presetCourse ?? data.courses[0]?.id ?? '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);

  /** Reads one or several files one after another; a broken file does not stop the others. */
  const onFiles = async (list?: FileList | File[] | null) => {
    const all = Array.from(list ?? []);
    if (!all.length) return;
    setError('');
    const failed: string[] = [];
    for (const [i, f] of all.entries()) {
      setBusy(all.length > 1 ? `Datei ${i + 1} von ${all.length} wird gelesen …` : 'Datei wird gelesen …');
      try {
        const t = await readFileText(f);
        setFiles((cur) => [...cur.filter((x) => x.name !== f.name), { id: Date.now() + i, name: f.name, text: t }]);
        setName((n) => n || f.name.replace(/\.[^.]+$/, ''));
      } catch (e) {
        failed.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    setBusy('');
    if (failed.length) setError(failed.join('\n'));
  };
  const onFile = (f?: File) => onFiles(f ? [f] : []);

  useEffect(() => {
    if (initialFile) void onFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Hands the work to the background: the window closes right away, cards appear in the deck when ready. */
  const run = () => {
    setError('');
    let target = existing;
    if (!target) {
      let cid = courseId;
      if (!cid) {
        const ws = data.workspaces[0] ?? addWorkspace('Erster Workspace');
        cid = addCourse(ws.id, 'Erster Kurs').id;
      }
      target = addDeck(cid, name.trim() || 'Neues Deck', { source: text });
    } else if (!useSource) {
      updateDeck(target.id, { source: [oldSource, text].filter(Boolean).join('\n\n') });
    }
    const fresh = getState().data.decks.find((d) => d.id === target!.id)!;
    startJob('cards', fresh, { count, focus, graphics, ...(fresh.source === text ? {} : { text }) });
    onClose();
    navigate(deckUrl(getState().data, fresh, 'cards'));
  };

  /** Waits here and lets you check every card before saving. */
  const runAndReview = async () => {
    setError('');
    setBusy('Die KI erstellt deine Karteikarten …');
    try {
      const cards = await generateCards(text, count, focus, graphics);
      setDrafts(cards.map((c) => ({ ...c, keep: true })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    const keep = (drafts || []).filter((d) => d.keep && d.front.trim() && d.back.trim());
    let target = existing;
    if (!target) {
      let cid = courseId;
      if (!cid) {
        const ws = data.workspaces[0] ?? addWorkspace('Erster Workspace');
        cid = addCourse(ws.id, 'Erster Kurs').id;
      }
      target = addDeck(cid, name.trim() || 'Neues Deck', { source: text });
    } else if (!useSource) {
      updateDeck(target.id, { source: [oldSource, text].filter(Boolean).join('\n\n') });
    }
    addCards(target.id, await withGraphics(keep));
    const fresh = getState().data.decks.find((d) => d.id === target!.id)!;
    onClose();
    navigate(deckUrl(getState().data, fresh, 'cards'));
  };

  if (!hasKey())
    return (
      <Modal title="Mit KI erstellen" onClose={onClose}>
        <NoKeyNotice />
      </Modal>
    );

  if (drafts)
    return (
      <Modal
        wide
        title={`${drafts.filter((d) => d.keep).length} Karteikarten prüfen`}
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setDrafts(null)}>
              Zurück
            </button>
            <button type="button" className="btn primary" onClick={save} disabled={!drafts.some((d) => d.keep)}>
              {existing ? 'Zum Deck hinzufügen' : 'Deck speichern'}
            </button>
          </>
        }
      >
        <p className="muted">Bearbeite oder entferne Karten, bevor du sie speicherst.</p>
        <div className="draft-list">
          {drafts.map((d, i) => (
            <div key={i} className={`draft ${d.keep ? '' : 'off'}`}>
              <div className="draft-fields">
                <textarea
                  className="input"
                  rows={2}
                  value={d.front}
                  aria-label="Vorderseite"
                  onChange={(e) => setDrafts(drafts.map((x, k) => (k === i ? { ...x, front: e.target.value } : x)))}
                />
                <textarea
                  className="input"
                  rows={2}
                  value={d.back}
                  aria-label="Rückseite"
                  onChange={(e) => setDrafts(drafts.map((x, k) => (k === i ? { ...x, back: e.target.value } : x)))}
                />
                {d.svg && cleanSvg(d.svg) && (
                  <img className="draft-svg" alt="Grafik zur Karte" src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cleanSvg(d.svg)!)} />
                )}
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={d.keep ? 'Karte entfernen' : 'Karte behalten'}
                onClick={() => setDrafts(drafts.map((x, k) => (k === i ? { ...x, keep: !x.keep } : x)))}
              >
                <IconTrash size={16} />
              </button>
            </div>
          ))}
        </div>
      </Modal>
    );

  return (
    <Modal
      wide
      title={existing ? `Karten für „${existing.name}“ erstellen` : 'Neues Deck mit KI erstellen'}
      onClose={onClose}
      footer={
        <>
          {onBack ? (
            <button type="button" className="btn ghost" onClick={onBack}>
              ← Zurück
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={onClose}>
              Abbrechen
            </button>
          )}
          <button type="button" className="btn outline" onClick={runAndReview} disabled={!!busy || text.trim().length < 40}>
            {busy ? busy : 'Erst prüfen, dann speichern'}
          </button>
          <button type="button" className="btn primary" onClick={run} disabled={!!busy || text.trim().length < 40}>
            <IconSparkle size={16} /> Im Hintergrund erstellen
          </button>
        </>
      }
    >
      <p className="muted small bg-hint">
        „Im Hintergrund erstellen“: Das Fenster schließt sich sofort und du kannst weiterlernen. Die Karten erscheinen von selbst im Deck,
        sobald die KI fertig ist{canSurviveClose() ? ' – auch wenn du die Website zwischendurch schließt' : ''}.
      </p>
      <div
        className="dropzone"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
      >
        <IconUpload size={26} />
        <b>{files.length ? 'Weitere Dateien hinzufügen' : `Dateien hierher ziehen (${MATERIAL_LABEL})`}</b>
        <span>oder klicken, um eine oder mehrere Dateien auszuwählen. Sie werden nur auf deinem Gerät gelesen.</span>
        <input ref={fileRef} type="file" multiple accept={MATERIAL_ACCEPT} hidden onChange={(e) => {
            void onFiles(e.target.files);
            // allows choosing the same file again later
            e.target.value = '';
          }}
        />
      </div>
      {files.length > 0 && (
        <div className="attachments">
          {files.map((x) => (
            <span key={x.id} className="attachment">
              <IconDoc size={14} />
              <b>{x.name}</b>
              <small>{Math.round(x.text.length / 1000) || '<1'}k Zeichen</small>
              <button type="button" className="icon-btn" aria-label={`${x.name} entfernen`} onClick={() => setFiles((cur) => cur.filter((y) => y.id !== x.id))}>
                <IconClose size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {text.length > CARD_MATERIAL_LIMIT && (
        <p className="form-warn">
          Sehr viel Material ({Math.round(text.length / 1000)}k Zeichen): Die KI liest pro Durchgang nur die ersten ca.{' '}
          {CARD_MATERIAL_LIMIT / 1000}k Zeichen. Verteile große Skripte am besten auf mehrere Decks, z. B. eines pro Kapitel oder Sitzung.
        </p>
      )}
      {oldSource && (
        <label className="check-row">
          <input type="checkbox" checked={useSource} onChange={(e) => setUseSource(e.target.checked)} />
          <span>Bisheriges Lernmaterial dieses Decks mitverwenden ({Math.round(oldSource.length / 1000) || '<1'}k Zeichen)</span>
        </label>
      )}
      <label className="field-label" htmlFor="ai-text">
        {files.length ? 'Eigene Notizen (optional)' : 'Oder füge deine Notizen ein'}
      </label>
      <textarea
        id="ai-text"
        className="input"
        rows={7}
        placeholder="Füge hier deinen Lernstoff ein – Vorlesungsnotizen, ein Kapitel, eine Webseite …"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="form-grid">
        {!existing && (
          <>
            <div>
              <label className="field-label" htmlFor="ai-name">
                Name des Decks
              </label>
              <input id="ai-name" className="input" value={name} placeholder="z. B. Zellbiologie Kapitel 3" onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="ai-course">
                Kurs
              </label>
              <select id="ai-course" className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {data.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {data.workspaces.find((w) => w.id === c.workspaceId)?.name} › {c.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div>
          <span className="field-label">Anzahl Karten</span>
          <div className="seg count-kind" role="radiogroup" aria-label="Anzahl Karten">
            <button type="button" role="radio" aria-checked={count === 0} className={count === 0 ? 'on' : ''} onClick={() => setCount(0)}>
              Automatisch
            </button>
            <button type="button" role="radio" aria-checked={count > 0} className={count > 0 ? 'on' : ''} onClick={() => count === 0 && setCount(15)}>
              Feste Anzahl
            </button>
          </div>
          {count === 0 ? (
            <small className="muted count-hint">
              So viele wie nötig – {text.trim() ? `etwa ${autoCardCount(text.length)}, je nach Inhalt mehr oder weniger` : 'je nach Umfang des Materials'}.
            </small>
          ) : (
            <>
              <label className="field-label" htmlFor="ai-count">
                {count} Karten
              </label>
              <input id="ai-count" type="range" min={5} max={50} step={5} value={count} onChange={(e) => setCount(+e.target.value)} />
            </>
          )}
        </div>
        <div>
          <label className="field-label" htmlFor="ai-focus">
            Schwerpunkt (optional)
          </label>
          <input id="ai-focus" className="input" value={focus} placeholder="z. B. Definitionen, Formeln" onChange={(e) => setFocus(e.target.value)} />
        </div>
      </div>
      <label className="check-row graphics-opt">
        <input type="checkbox" checked={graphics} onChange={(e) => setGraphics(e.target.checked)} />
        <span>
          <b>Mit Grafiken:</b> Die KI zeichnet für passende Karten ein Schaubild, einen Graphen oder eine Abbildung auf die Rückseite.
        </span>
      </label>
      {text.trim().length > 0 && text.trim().length < 40 && <p className="muted small">Bitte etwas mehr Text eingeben.</p>}
      {text.trim().length >= 40 && <CostHint est={estimate.cards(text.length, count, graphics)} />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
