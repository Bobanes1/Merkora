/**
 * Online sync of the learning data (decks, cards, progress, pictures) with Dropbox or Google Drive.
 * Everything lives in the person's own cloud storage: Dropbox "App folder" or Google Drive's hidden app data.
 * Two copies are merged card by card, so learning on two devices doesn't lose progress.
 */
import { useSyncExternalStore } from 'react';
import { mediaGet, mediaKeys, mediaPutMany } from './db';
import { applySynced, getState, subscribe, type Card, type Data, type Deck } from './store';

export type SyncProvider = 'dropbox' | 'gdrive';
export type SyncConf = {
  provider: SyncProvider | null;
  auto: boolean;
  dropboxAppKey: string;
  dropboxRefresh?: string;
  dropboxAccess?: string;
  dropboxExp?: number;
  googleClientId: string;
  googleToken?: string;
  googleExp?: number;
  lastSync?: number;
  device: string;
};
export type SyncStatus = { state: 'off' | 'idle' | 'syncing' | 'ok' | 'error' | 'login'; text: string; at?: number };

const CONF_KEY = 'merkora.sync';
const MAIN = 'merkora-sync.json';
const DROPBOX_TOKEN = 'https://api.dropboxapi.com/oauth2/token';

// ---------- config & status (small external store) ----------
function loadConf(): SyncConf {
  const base: SyncConf = { provider: null, auto: true, dropboxAppKey: '', googleClientId: '', device: Math.random().toString(36).slice(2, 8) };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(CONF_KEY) || '{}') };
  } catch {
    return base;
  }
}
let conf = loadConf();
let status: SyncStatus = conf.provider ? { state: 'idle', text: 'Bereit', at: conf.lastSync } : { state: 'off', text: 'Nicht verbunden' };
let snap = { conf, status };
const listeners = new Set<() => void>();
const emit = () => {
  snap = { conf, status };
  listeners.forEach((l) => l());
};
export function setConf(p: Partial<SyncConf>) {
  conf = { ...conf, ...p };
  try {
    localStorage.setItem(CONF_KEY, JSON.stringify(conf));
  } catch {
    /* ignore */
  }
  emit();
}
function setStatus(s: SyncStatus) {
  status = s;
  emit();
}
export const useSync = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
  );
export const getConf = () => conf;
export const redirectUri = () => `${location.origin}/sync-callback`;

// ---------- helpers ----------
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
function randomString(n = 64) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a).slice(0, n);
}
class SyncError extends Error {}
class NeedsLogin extends SyncError {}

async function check(res: Response, what: string) {
  if (res.ok) return res;
  if (res.status === 401) throw new NeedsLogin('Die Anmeldung ist abgelaufen. Bitte verbinde dich neu.');
  let msg = `${res.status}`;
  try {
    msg = (await res.text()).slice(0, 200) || msg;
  } catch {
    /* keep */
  }
  throw new SyncError(`${what} fehlgeschlagen (${msg}).`);
}

// ---------- Dropbox (OAuth with PKCE, refresh token; no secret needed) ----------
export async function dropboxConnect() {
  if (!conf.dropboxAppKey.trim()) throw new SyncError('Bitte zuerst den App-Key eintragen.');
  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = randomString(16);
  sessionStorage.setItem('merkora.pkce', JSON.stringify({ verifier, state }));
  const u = new URL('https://www.dropbox.com/oauth2/authorize');
  u.search = new URLSearchParams({
    client_id: conf.dropboxAppKey.trim(),
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
    redirect_uri: redirectUri(),
    state,
  }).toString();
  location.assign(u.toString());
}

/** Finishes the Dropbox sign-in on /sync-callback. */
export async function dropboxFinish(params: URLSearchParams) {
  const saved = JSON.parse(sessionStorage.getItem('merkora.pkce') || 'null') as { verifier: string; state: string } | null;
  if (params.get('error')) throw new SyncError(params.get('error_description') || 'Anmeldung abgebrochen.');
  if (!saved || saved.state !== params.get('state')) throw new SyncError('Die Anmeldung passt nicht zu dieser Sitzung. Bitte noch einmal verbinden.');
  const res = await fetch(DROPBOX_TOKEN, {
    method: 'POST',
    body: new URLSearchParams({
      code: params.get('code') || '',
      grant_type: 'authorization_code',
      client_id: conf.dropboxAppKey.trim(),
      redirect_uri: redirectUri(),
      code_verifier: saved.verifier,
    }),
  });
  await check(res, 'Dropbox-Anmeldung');
  const j = await res.json();
  sessionStorage.removeItem('merkora.pkce');
  setConf({ provider: 'dropbox', dropboxAccess: j.access_token, dropboxRefresh: j.refresh_token, dropboxExp: Date.now() + (j.expires_in - 60) * 1000 });
  setStatus({ state: 'idle', text: 'Mit Dropbox verbunden' });
}

async function dropboxToken(): Promise<string> {
  if (conf.dropboxAccess && (conf.dropboxExp ?? 0) > Date.now()) return conf.dropboxAccess;
  if (!conf.dropboxRefresh) throw new NeedsLogin('Bitte mit Dropbox verbinden.');
  const res = await fetch(DROPBOX_TOKEN, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conf.dropboxRefresh, client_id: conf.dropboxAppKey.trim() }),
  });
  if (res.status === 400 || res.status === 401) throw new NeedsLogin('Die Dropbox-Verbindung wurde aufgehoben. Bitte neu verbinden.');
  await check(res, 'Dropbox-Anmeldung erneuern');
  const j = await res.json();
  setConf({ dropboxAccess: j.access_token, dropboxExp: Date.now() + (j.expires_in - 60) * 1000 });
  return j.access_token;
}

const dbxArg = (o: object) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

const dropbox: Remote = {
  async readMain() {
    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: { authorization: `Bearer ${await dropboxToken()}`, 'Dropbox-API-Arg': dbxArg({ path: '/' + MAIN }) },
    });
    if (res.status === 409) return null;
    await check(res, 'Laden aus Dropbox');
    return (await res.json()) as SyncDoc;
  },
  async writeMain(doc) {
    const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await dropboxToken()}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': dbxArg({ path: '/' + MAIN, mode: 'overwrite', mute: true }),
      },
      body: JSON.stringify(doc),
    });
    await check(res, 'Speichern in Dropbox');
  },
  async listMedia() {
    const out = new Map<string, string>();
    const token = await dropboxToken();
    let res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/media', limit: 2000 }),
    });
    if (res.status === 409) return out;
    for (;;) {
      await check(res, 'Bilderliste aus Dropbox');
      const j = await res.json();
      for (const e of j.entries || []) if (e['.tag'] === 'file') out.set(e.name, e.path_lower);
      if (!j.has_more) break;
      res = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ cursor: j.cursor }),
      });
    }
    return out;
  },
  async putMedia(id, blob) {
    const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await dropboxToken()}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': dbxArg({ path: `/media/${id}`, mode: 'overwrite', mute: true }),
      },
      body: blob,
    });
    await check(res, 'Bild hochladen');
  },
  async getMedia(id, ref) {
    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: { authorization: `Bearer ${await dropboxToken()}`, 'Dropbox-API-Arg': dbxArg({ path: ref || `/media/${id}` }) },
    });
    if (res.status === 409) return null;
    await check(res, 'Bild laden');
    return res.blob();
  },
};

// ---------- Google Drive (Google Identity Services token, hidden app-data folder) ----------
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (o: {
            client_id: string;
            scope: string;
            callback: (r: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => void;
            error_callback?: (e: { message?: string; type?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}
function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new SyncError('Google-Anmeldung konnte nicht geladen werden (keine Internetverbindung?).'));
    document.head.appendChild(s);
  });
}

/** Opens Google's sign-in window (must be called from a click). */
export async function googleConnect(prompt: '' | 'consent' = 'consent') {
  if (!conf.googleClientId.trim()) throw new SyncError('Bitte zuerst die Client-ID eintragen.');
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: conf.googleClientId.trim(),
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new SyncError(r.error_description || r.error || 'Anmeldung abgebrochen.'));
        setConf({ provider: 'gdrive', googleToken: r.access_token, googleExp: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 });
        setStatus({ state: 'idle', text: 'Mit Google Drive verbunden' });
        resolve();
      },
      error_callback: (e) => reject(new SyncError(e.message || 'Das Google-Fenster wurde geschlossen.')),
    });
    client.requestAccessToken({ prompt });
  });
}
function googleToken(): string {
  if (conf.googleToken && (conf.googleExp ?? 0) > Date.now()) return conf.googleToken;
  throw new NeedsLogin('Die Google-Anmeldung gilt eine Stunde. Klicke auf „Neu anmelden“, um weiter zu synchronisieren.');
}
const G = 'https://www.googleapis.com/drive/v3/files';
const GU = 'https://www.googleapis.com/upload/drive/v3/files';
async function gFind(name: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${name}' and trashed=false`);
  const res = await fetch(`${G}?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`, { headers: { authorization: `Bearer ${googleToken()}` } });
  await check(res, 'Suche in Google Drive');
  return (await res.json()).files?.[0]?.id ?? null;
}
async function gUpload(name: string, body: Blob, existing?: string | null) {
  const auth = { authorization: `Bearer ${googleToken()}` };
  if (existing) {
    const res = await fetch(`${GU}/${existing}?uploadType=media`, { method: 'PATCH', headers: auth, body });
    await check(res, 'Speichern in Google Drive');
    return;
  }
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: ['appDataFolder'] })], { type: 'application/json' }));
  form.append('file', body);
  const res = await fetch(`${GU}?uploadType=multipart`, { method: 'POST', headers: auth, body: form });
  await check(res, 'Speichern in Google Drive');
}
let gMainId: string | null = null;
const gdrive: Remote = {
  async readMain() {
    gMainId = await gFind(MAIN);
    if (!gMainId) return null;
    const res = await fetch(`${G}/${gMainId}?alt=media`, { headers: { authorization: `Bearer ${googleToken()}` } });
    await check(res, 'Laden aus Google Drive');
    return (await res.json()) as SyncDoc;
  },
  async writeMain(doc) {
    await gUpload(MAIN, new Blob([JSON.stringify(doc)], { type: 'application/json' }), gMainId ?? (await gFind(MAIN)));
  },
  async listMedia() {
    const out = new Map<string, string>();
    let page = '';
    do {
      const q = encodeURIComponent("name contains 'media-' and trashed=false");
      const res = await fetch(`${G}?spaces=appDataFolder&q=${q}&fields=nextPageToken,files(id,name)&pageSize=1000${page ? `&pageToken=${page}` : ''}`, {
        headers: { authorization: `Bearer ${googleToken()}` },
      });
      await check(res, 'Bilderliste aus Google Drive');
      const j = await res.json();
      for (const f of j.files || []) out.set(String(f.name).replace(/^media-/, ''), f.id);
      page = j.nextPageToken || '';
    } while (page);
    return out;
  },
  async putMedia(id, blob) {
    await gUpload(`media-${id}`, blob);
  },
  async getMedia(_id, ref) {
    if (!ref) return null;
    const res = await fetch(`${G}/${ref}?alt=media`, { headers: { authorization: `Bearer ${googleToken()}` } });
    if (res.status === 404) return null;
    await check(res, 'Bild laden');
    return res.blob();
  },
};

// ---------- merging ----------
type SyncDoc = { app: 'merkora'; format: 1; savedAt: number; device: string; data: Data };
type Remote = {
  readMain(): Promise<SyncDoc | null>;
  writeMain(doc: SyncDoc): Promise<void>;
  /** media id → provider reference (path or file id) */
  listMedia(): Promise<Map<string, string>>;
  putMedia(id: string, blob: Blob): Promise<void>;
  getMedia(id: string, ref?: string): Promise<Blob | null>;
};

const cardTime = (c: Card) => Math.max(c.srs.last ?? 0, c.updatedAt ?? c.createdAt);
function unionById<T extends { id: string }>(a: T[], b: T[], isDel: (id: string) => boolean, pick: (x: T, y: T) => T = (x) => x): T[] {
  const map = new Map<string, T>();
  for (const x of a) if (!isDel(x.id)) map.set(x.id, x);
  for (const y of b) {
    if (isDel(y.id)) continue;
    const x = map.get(y.id);
    map.set(y.id, x ? pick(x, y) : y);
  }
  return [...map.values()];
}
function mergeDeck(a: Deck, b: Deck, isDel: (id: string) => boolean): Deck {
  const newer = (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a;
  const older = newer === a ? b : a;
  const cards = unionById(newer.cards, older.cards, isDel, (x, y) => (cardTime(y) > cardTime(x) ? y : x));
  const path = { ...(older.path ?? {}) };
  for (const [k, r] of Object.entries(newer.path ?? {})) {
    const o = path[k];
    path[k] = o ? { stars: Math.max(o.stars, r.stars), best: Math.max(o.best, r.best), at: Math.max(o.at, r.at) } : r;
  }
  return { ...newer, cards, path, updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0) || undefined };
}
export function mergeData(local: Data, remote: Data): Data {
  const deleted = { ...(remote.deleted ?? {}), ...(local.deleted ?? {}) };
  const isDel = (id: string) => id in deleted;
  const seen = new Set<string>();
  const reviews = [...local.reviews, ...(remote.reviews ?? [])].filter((r) => {
    const k = `${r.deckId}|${r.cardId}|${r.at}`;
    if (seen.has(k) || isDel(r.deckId)) return false;
    seen.add(k);
    return true;
  });
  const xp = { ...(remote.game?.xpByDay ?? {}) };
  for (const [d, n] of Object.entries(local.game.xpByDay)) xp[d] = Math.max(n, xp[d] ?? 0);
  const minutes = { ...(remote.game?.minutesByDay ?? {}) };
  for (const [d, n] of Object.entries(local.game.minutesByDay ?? {})) minutes[d] = Math.max(n, minutes[d] ?? 0);
  return {
    ...local,
    workspaces: unionById(local.workspaces, remote.workspaces ?? [], isDel),
    courses: unionById(local.courses, remote.courses ?? [], isDel, (x, y) => ({ ...x, folders: unionById(x.folders ?? [], y.folders ?? [], isDel) })),
    decks: unionById(local.decks, remote.decks ?? [], isDel, (x, y) => mergeDeck(x, y, isDel)),
    reviews: reviews.sort((x, y) => x.at - y.at),
    exams: unionById(local.exams ?? [], remote.exams ?? [], isDel, (x, y) => ((y.updatedAt ?? y.createdAt) > (x.updatedAt ?? x.createdAt) ? y : x)),
    game: { ...local.game, xpByDay: xp, minutesByDay: minutes },
    deleted,
  };
}
const shareable = (d: Data) => JSON.stringify({ ...d, settings: undefined, jobs: undefined });

function referencedMedia(d: Data) {
  const ids = new Set<string>();
  const re = /data-media="([^"]+)"/g;
  for (const deck of d.decks)
    for (const c of deck.cards) if (c.html) for (const s of [c.front, c.back]) for (const m of s.matchAll(re)) ids.add(m[1]);
  for (const deck of d.decks) for (const f of deck.files ?? []) ids.add(f.id);
  return ids;
}

// ---------- running a sync ----------
const remote = (): Remote | null => (conf.provider === 'dropbox' ? dropbox : conf.provider === 'gdrive' ? gdrive : null);
let running: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  if (!running)
    running = doSync().finally(() => {
      running = null;
    });
  return running;
}

async function doSync() {
  const r = remote();
  if (!r) return;
  if (!navigator.onLine) {
    setStatus({ state: 'error', text: 'Offline – wird synchronisiert, sobald du wieder online bist.', at: conf.lastSync });
    return;
  }
  setStatus({ state: 'syncing', text: 'Wird synchronisiert …', at: conf.lastSync });
  try {
    const doc = await r.readMain();
    const local = getState().data;
    const merged = doc?.data ? mergeData(local, doc.data) : local;
    if (shareable(merged) !== shareable(local)) applySynced(merged);

    // pictures and sounds
    const want = referencedMedia(merged);
    const remoteMedia = await r.listMedia();
    const localMedia = new Set((await mediaKeys()).map(String));
    let up = 0;
    let down = 0;
    for (const id of want) {
      if (localMedia.has(id) && !remoteMedia.has(id)) {
        const rec = await mediaGet(id);
        if (rec) {
          await r.putMedia(id, rec.blob);
          up++;
        }
      } else if (!localMedia.has(id) && remoteMedia.has(id)) {
        const blob = await r.getMedia(id, remoteMedia.get(id));
        if (blob) {
          await mediaPutMany([{ id, rec: { blob, name: id, type: blob.type || 'application/octet-stream' } }]);
          down++;
        }
      }
    }

    if (!doc || shareable(doc.data) !== shareable(merged)) {
      const data = { ...getState().data, jobs: [] };
      await r.writeMain({ app: 'merkora', format: 1, savedAt: Date.now(), device: conf.device, data });
    }
    setConf({ lastSync: Date.now() });
    setStatus({
      state: 'ok',
      text: `Synchronisiert${up || down ? ` (${up ? `${up} Bilder hochgeladen` : ''}${up && down ? ', ' : ''}${down ? `${down} Bilder geladen` : ''})` : ''}`,
      at: Date.now(),
    });
  } catch (e) {
    if (e instanceof NeedsLogin) setStatus({ state: 'login', text: e.message, at: conf.lastSync });
    else setStatus({ state: 'error', text: (e as Error).message || 'Synchronisieren fehlgeschlagen.', at: conf.lastSync });
  }
}

export function disconnect() {
  setConf({ provider: null, dropboxAccess: undefined, dropboxRefresh: undefined, dropboxExp: undefined, googleToken: undefined, googleExp: undefined });
  setStatus({ state: 'off', text: 'Nicht verbunden' });
}

/** Syncs on start, a little while after every change, when going online and when the window is hidden. */
let started = false;
export function startAutoSync() {
  if (started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = (ms: number) => {
    if (!conf.provider || !conf.auto) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), ms);
  };
  soon(1500);
  let last = getState().data;
  subscribe(() => {
    const now = getState().data;
    if (now !== last) {
      last = now;
      if (!running) soon(15000);
    }
  });
  window.addEventListener('online', () => soon(1000));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && soon(0));
}
