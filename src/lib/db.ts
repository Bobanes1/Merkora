/** Tiny IndexedDB wrapper: a key/value store for the learning data and a store for card media (images, audio). */
import { inTauri, mediaFileDelete, mediaFileKeys, mediaFileUrl, mediaGetFile, mediaPutFile } from './desktop';

const DB_NAME = 'merkora';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB nicht verfügbar'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const kvGet = <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => tx('kv', 'readwrite', (s) => void s.put(value, key));
export const kvDel = (key: string) => tx('kv', 'readwrite', (s) => void s.delete(key));

export type MediaRecord = { blob: Blob; name: string; type: string };

// In the desktop app pictures and sounds are files in the app's data folder (Rust core); in the browser they live in IndexedDB.
export const mediaGet = (id: string) =>
  inTauri ? mediaGetFile(id) : tx<MediaRecord | undefined>('media', 'readonly', (s) => s.get(id));
export const mediaKeys = (): Promise<IDBValidKey[]> =>
  inTauri ? mediaFileKeys() : tx<IDBValidKey[]>('media', 'readonly', (s) => s.getAllKeys());
export async function mediaPutMany(items: { id: string; rec: MediaRecord }[]) {
  if (inTauri) {
    for (const it of items) await mediaPutFile(it.id, it.rec.name, it.rec.type, it.rec.blob);
    return;
  }
  return tx('media', 'readwrite', (s) => {
    for (const it of items) s.put(it.rec, it.id);
  });
}
export function mediaDeleteMany(ids: string[]) {
  if (inTauri) return mediaFileDelete(ids);
  return tx('media', 'readwrite', (s) => {
    for (const id of ids) s.delete(id);
  });
}
export const mediaClear = async () => {
  if (inTauri) return mediaFileDelete((await mediaFileKeys()).map(String));
  return tx('media', 'readwrite', (s) => void s.clear());
};

// ---------- object URLs for rendering ----------
const urls = new Map<string, Promise<string | null>>();

export function mediaUrl(id: string): Promise<string | null> {
  if (inTauri) return Promise.resolve(mediaFileUrl(id));
  let p = urls.get(id);
  if (!p) {
    p = mediaGet(id)
      .then((r) => (r ? URL.createObjectURL(r.blob) : null))
      .catch(() => null);
    urls.set(id, p);
  }
  return p;
}
