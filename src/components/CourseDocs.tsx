import { useState } from 'react';
import { Link } from 'react-router-dom';
import { courseDocs, fileSize } from '../lib/courseDocs';
import { FILE_KIND_LABEL, fileKind } from '../lib/fileKind';
import { deckUrl, useData, type Course, type DeckFile } from '../lib/store';
import { FileViewer } from './FileViewer';
import { IconDoc, IconNote } from './Icons';

/** All files of a course in one place: each opens in the viewer; text-only material links to the deck. */
export function CourseDocs({ course }: { course: Course }) {
  const data = useData();
  const { files, texts } = courseDocs(course, data.decks);
  const [open, setOpen] = useState<{ file: DeckFile; deckId: string } | null>(null);
  const deck = open ? data.decks.find((d) => d.id === open.deckId) : undefined;

  if (!files.length && !texts.length) return <p className="muted">Noch keine Dateien in diesem Kurs – lade sie im Deck unter „Material“ hoch.</p>;

  return (
    <div className="course-docs">
      {files.length > 0 && (
        <ul className="doc-list">
          {files.map((f) => {
            const k = fileKind(f.name, f.type ?? 'application/pdf');
            return (
              <li key={f.fileId}>
                <button
                  type="button"
                  className="doc-item"
                  onClick={() => setOpen({ file: { id: f.fileId, name: f.name, size: f.size, type: f.type, addedAt: 0 }, deckId: f.deckId })}
                >
                  <span className={'file-ico k-' + k}>
                    <IconDoc size={16} />
                  </span>
                  <span className="doc-text">
                    <b title={f.name}>{f.name}</b>
                    <small className="muted">
                      {FILE_KIND_LABEL[k]} · {f.folder ? `${f.folder} › ` : ''}
                      {f.deckName} · {fileSize(f.size)}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {texts.length > 0 && (
        <>
          <span className="field-label">Lernmaterial als Text (ohne gespeicherte Datei)</span>
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
      {open && deck && <FileViewer file={open.file} deck={deck} onClose={() => setOpen(null)} />}
    </div>
  );
}
