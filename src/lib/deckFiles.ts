/** The original material files of a deck (PDF, Word, PowerPoint, text …): stored like card pictures, shown under "Material". */
import { mediaGet, mediaPutMany } from './db';
import { fileKind, mimeOf } from './fileKind';
import { collectMediaGarbage, updateDeck, type DeckFile } from './store';
import { uid } from './util';

/** Stores the material files with the deck (a file with the same name replaces the older one). Returns how many. */
export async function attachFiles(deckId: string, files: File[]): Promise<number> {
  const keep = files.filter((f) => fileKind(f.name, f.type) !== 'other');
  if (!keep.length) return 0;
  const recs = keep.map((f) => ({ id: 'mat-' + uid(), f, type: mimeOf(f.name, f.type) }));
  await mediaPutMany(recs.map(({ id, f, type }) => ({ id, rec: { blob: f, name: f.name, type } })));
  const added: DeckFile[] = recs.map(({ id, f, type }) => ({ id, name: f.name, size: f.size, addedAt: Date.now(), type }));
  // a replaced file is cleaned up later (not now: pictures of cards being made may not be saved on a card yet)
  updateDeck(deckId, (d) => ({ files: [...(d.files ?? []).filter((x) => !added.some((a) => a.name === x.name)), ...added] }));
  return added.length;
}
/** @deprecated older name – all material files are kept now */
export const attachPdfs = attachFiles;

/** PDFs of a deck (for the slide view and slide pictures on cards). */
export const pdfFiles = (files: DeckFile[] = []) => files.filter((f) => fileKind(f.name, f.type ?? 'application/pdf') === 'pdf');

/** Removes a file from the deck (the text taken from it stays in the material). */
export function removeDeckFile(deckId: string, id: string) {
  updateDeck(deckId, (d) => ({ files: (d.files ?? []).filter((x) => x.id !== id) }));
  void collectMediaGarbage();
}

/** The stored file, or null if it is missing (e.g. not synced to this device yet). */
export async function deckFileBlob(id: string): Promise<Blob | null> {
  const r = await mediaGet(id).catch(() => undefined);
  return r?.blob ?? null;
}
