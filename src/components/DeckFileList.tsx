import { useState } from 'react';
import { fileSize } from '../lib/courseDocs';
import { deckFileBlob, removeDeckFile } from '../lib/deckFiles';
import { FILE_KIND_LABEL, fileKind } from '../lib/fileKind';
import type { Deck, DeckFile } from '../lib/store';
import { download } from '../lib/util';
import { FileViewer } from './FileViewer';
import { IconDoc, IconDownload, IconTrash } from './Icons';
import { ConfirmModal } from './Modal';

/** "Deine Dateien": the material files of a deck, each opens in the viewer. */
export function DeckFileList({ deck }: { deck: Deck }) {
  const files = deck.files ?? [];
  const [open, setOpen] = useState<DeckFile | null>(null);
  const [del, setDel] = useState<DeckFile | null>(null);
  if (!files.length) return null;
  return (
    <section className="deck-files">
      <b className="deck-files-title">Deine Dateien ({files.length})</b>
      <ul>
        {files.map((f) => {
          const k = fileKind(f.name, f.type ?? 'application/pdf');
          return (
            <li key={f.id} className="deck-file">
              <button type="button" className="deck-file-main" onClick={() => setOpen(f)} title="In Merkora ansehen">
                <span className={'file-ico k-' + k}>
                  <IconDoc size={18} />
                </span>
                <span className="deck-file-text">
                  <b>{f.name}</b>
                  <small className="muted">
                    {FILE_KIND_LABEL[k]} · {fileSize(f.size)} · {new Date(f.addedAt).toLocaleDateString('de-DE')}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`${f.name} herunterladen`}
                title="Herunterladen"
                onClick={() => void deckFileBlob(f.id).then((b) => b && download(f.name, b, f.type))}
              >
                <IconDownload size={16} />
              </button>
              <button type="button" className="icon-btn" aria-label={`${f.name} entfernen`} title="Entfernen" onClick={() => setDel(f)}>
                <IconTrash size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      {open && <FileViewer file={open} deck={deck} onClose={() => setOpen(null)} />}
      {del && (
        <ConfirmModal
          title="Datei entfernen?"
          text={`„${del.name}“ wird aus dem Deck entfernt. Der daraus gelesene Text und deine Karten bleiben.`}
          confirm="Entfernen"
          onClose={() => setDel(null)}
          onConfirm={() => removeDeckFile(deck.id, del.id)}
        />
      )}
    </section>
  );
}
