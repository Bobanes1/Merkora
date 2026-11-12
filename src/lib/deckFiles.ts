/** The original material files of a deck (PDF presentations): stored like card pictures, shown under "Lernmaterial". */
import { mediaGet, mediaPutMany } from './db';
import { isPdf } from './files';
import { collectMediaGarbage, updateDeck, type DeckFile } from './store';
import { uid } from './util';

/** Stores the PDFs among `files` with the deck (a file with the same name replaces the older one). Returns how many. */
export async function attachPdfs(deckId: string, files: File[]): Promise<number> {
  const pdfs = files.filter(isPdf);
  if (!pdfs.length) return 0;
  const recs = pdfs.map((f) => ({ id: 'mat-' + uid(), f }));
  await mediaPutMany(recs.map(({ id, f }) => ({ id, rec: { blob: f, name: f.name, type: 'application/pdf' } })));
  const added: DeckFile[] = recs.map(({ id, f }) => ({ id, name: f.name, size: f.size, addedAt: Date.now() }));
  // a replaced file is cleaned up later (not now: pictures of cards being made may not be saved on a card yet)
  updateDeck(deckId, (d) => ({ files: [...(d.files ?? []).filter((x) => !added.some((a) => a.name === x.name)), ...added] }));
  return added.length;
}

/** Removes a file from the deck (the text taken from it stays in the material). */
export function removeDeckFile(deckId: string, id: string) {
  updateDeck(deckId, (d) => ({ files: (d.files ?? []).filter((x) => x.id !== id) }));
  void collectMediaGarbage();
}

/** The stored PDF, or null if it is missing (e.g. not synced to this device yet). */
export async function deckFileBlob(id: string): Promise<Blob | null> {
  const r = await mediaGet(id).catch(() => undefined);
  return r?.blob ?? null;
}
