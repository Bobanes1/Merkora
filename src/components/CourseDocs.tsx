import { useState } from 'react';
import { Link } from 'react-router-dom';
import { courseDocs, fileSize } from '../lib/courseDocs';
import { deckUrl, useData, type Course } from '../lib/store';
import { IconDoc, IconNote } from './Icons';
import { SlideViewer } from './SlideViewer';

/** All uploaded documents of a course in one place: PDFs open in the slide viewer, text material links to the deck. */
export function CourseDocs({ course }: { course: Course }) {
  const data = useData();
  const { files, texts } = courseDocs(course, data.decks);
  const [open, setOpen] = useState<string | null>(files[0]?.fileId ?? null);
  const doc = files.find((f) => f.fileId === open);
  const deck = doc ? data.decks.find((d) => d.id === doc.deckId) : undefined;

  if (!files.length && !texts.length) return <p className="muted">Noch keine Dokumente in diesem Kurs – lade sie im Deck unter „Lernen › Material“ hoch.</p>;

  return (
    <div className="course-docs">
      {files.length > 0 && (
        <ul className="doc-list">
          {files.map((f) => (
            <li key={f.fileId}>
              <button type="button" className={'doc-item' + (open === f.fileId ? ' on' : '')} aria-pressed={open === f.fileId} onClick={() => setOpen(f.fileId)}>
                <IconDoc size={16} />
                <span className="doc-text">
                  <b title={f.name}>{f.name}</b>
                  <small className="muted">
                    {f.folder ? `${f.folder} › ` : ''}
                    {f.deckName} · {fileSize(f.size)}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {doc && deck && <SlideViewer key={doc.fileId} deck={deck} fileId={doc.fileId} />}
      {texts.length > 0 && (
        <>
          <span className="field-label">Lernmaterial als Text</span>
          <ul className="doc-list">
            {texts.map((t) => {
              const d = data.decks.find((x) => x.id === t.deckId)!;
              return (
                <li key={t.deckId}>
                  <Link to={deckUrl(data, d, 'source')} className="doc-item">
                    <IconNote size={16} />
                    <span className="doc-text">
                      <b title={t.deckName}>{t.deckName}</b>
                      <small className="muted">
                        {t.folder ? `${t.folder} · ` : ''}
                        {t.chars.toLocaleString('de-DE')} Zeichen
                      </small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
