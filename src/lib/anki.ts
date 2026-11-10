/**
 * Imports Anki deck packages (.apkg / .colpkg) with their pictures, sounds and look (note type CSS).
 * Desktop app: the Rust core reads the package and stores the media as files.
 * Browser: parsed here with sql.js and stored in IndexedDB.
 */
import { sanitize } from './content';
import { importApkgBytes, importApkgPath, inTauri } from './desktop';
import { uid } from './util';

export type ImportedCard = { front: string; back: string; styleId?: string; cardClass?: string };
export type ImportedDeck = { name: string; cards: ImportedCard[] };
export type AnkiResult = { decks: ImportedDeck[]; styles: Record<string, string>; media: number; missingMedia: number; skipped: number };

/** `src` is a file chosen in the window or (desktop app) the path of a file opened with Merkora. */
export async function readApkg(src: File | Blob | string, onProgress: (t: string) => void = () => undefined): Promise<AnkiResult> {
  if (inTauri) {
    onProgress('Anki-Stapel wird gelesen …');
    const res =
      typeof src === 'string' ? await importApkgPath(src) : await importApkgBytes(new Uint8Array(await src.arrayBuffer()));
    onProgress('Karten werden vorbereitet …');
    return {
      ...res,
      decks: res.decks.map((d) => ({
        name: d.name,
        cards: d.cards.map((c) => ({ ...c, front: sanitize(c.front), back: sanitize(c.back) })),
      })),
    };
  }
  if (typeof src === 'string') throw new Error('Dateipfade können nur in der Desktop-App geöffnet werden.');
  onProgress('Datei wird gelesen …');
  const [{ default: initSqlJs }, { default: wasmUrl }, { parseApkg }, { mediaPutMany }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
    import('./anki-core'),
    import('./db'),
  ]);
  const bytes = new Uint8Array(await src.arrayBuffer());
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const res = await parseApkg(bytes, SQL, { sanitize, uid, onProgress });
  for (let i = 0; i < res.media.length; i += 100) {
    const part = res.media.slice(i, i + 100);
    await mediaPutMany(
      part.map((m) => ({ id: m.id, rec: { blob: new Blob([m.bytes as unknown as BlobPart], { type: m.type }), name: m.name, type: m.type } })),
    );
    onProgress(`Bilder und Töne werden gespeichert … (${Math.min(i + 100, res.media.length)}/${res.media.length})`);
  }
  return { decks: res.decks, styles: res.styles, media: res.media.length, missingMedia: res.missingMedia, skipped: res.skipped };
}
