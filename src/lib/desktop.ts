/**
 * Bridge to the Merkora desktop app (Tauri, Rust core): save file with backups, media files on disk,
 * Anki import, AI requests without browser restrictions and .apkg files opened with the app.
 * In the plain web version none of this exists and the app falls back to browser storage.
 */
import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import type { AnkiProgress } from './srs';

export const inTauri = typeof window !== 'undefined' && isTauri();

export type DesktopBridge = {
  loadData: () => Promise<string | null>;
  saveData: (json: string) => Promise<void>;
  /** Saves right away and waits for it (used when the window closes). */
  saveDataNow: (json: string) => Promise<void>;
  dataFolder: () => Promise<string>;
  openDataFolder: () => void;
  /** Calls back with paths of .apkg files opened with the app (double-click, "Öffnen mit", second start). */
  onOpenFile: (cb: (path: string) => void) => void;
  /** Runs before the window closes. */
  onClose: (cb: () => Promise<void> | void) => void;
};

let openFileCb: ((path: string) => void) | null = null;
let openFileWired = false;

function makeBridge(): DesktopBridge {
  return {
    loadData: () => invoke<string | null>('load_data'),
    saveData: (json) => invoke('save_data', { json }),
    saveDataNow: (json) => invoke('save_data_now', { json }),
    dataFolder: () => invoke<string>('data_folder'),
    openDataFolder: () => void invoke('open_data_folder'),
    onOpenFile: (cb) => {
      openFileCb = cb;
      const take = () =>
        invoke<string[]>('take_open_files')
          .then((paths) => paths.forEach((p) => openFileCb?.(p)))
          .catch(() => undefined);
      if (!openFileWired) {
        openFileWired = true;
        void import('@tauri-apps/api/event').then(({ listen }) => listen('open-file', take));
      }
      void take();
    },
    onClose: (cb) => {
      // The app asks the page to save before it closes (or hides in the tray); after 2 s it closes anyway.
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen('app-closing', async () => {
          try {
            await Promise.race([cb(), new Promise((r) => setTimeout(r, 2000))]);
          } catch {
            /* close anyway */
          }
          await invoke('finish_close').catch(() => undefined);
        }),
      );
    },
  };
}

export const desktop: DesktopBridge | undefined = inTauri ? makeBridge() : undefined;
export const isDesktop = !!desktop;

/** Opens a web address in the normal browser. */
export function openExternal(url: string) {
  if (inTauri) void invoke('open_external', { url });
  else window.open(url, '_blank', 'noopener');
}

// ---------- media ----------
export const mediaFileUrl = (id: string) => convertFileSrc(id, 'media');

export async function mediaPutFile(id: string, name: string, type: string, blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke('media_put', bytes, { headers: { 'x-id': id, 'x-name': encodeURIComponent(name), 'x-type': type || '' } });
}
export async function mediaGetFile(id: string): Promise<{ blob: Blob; name: string; type: string } | undefined> {
  try {
    const [buf, type] = await Promise.all([invoke<ArrayBuffer>('media_get', { id }), invoke<string | null>('media_type', { id })]);
    const t = type ?? 'application/octet-stream';
    return { blob: new Blob([buf], { type: t }), name: id, type: t };
  } catch {
    return undefined;
  }
}
export const mediaFileKeys = () => invoke<string[]>('media_keys');
export const mediaFileDelete = (ids: string[]) => invoke('media_delete', { ids });

// ---------- Anki ----------
export type RustAnkiResult = {
  decks: {
    name: string;
    cards: { front: string; back: string; styleId?: string; cardClass: string; tags?: string[]; progress?: AnkiProgress }[];
  }[];
  styles: Record<string, string>;
  media: number;
  missingMedia: number;
  skipped: number;
  crt: number;
  withProgress: number;
};
export function importApkgBytes(bytes: Uint8Array) {
  return invoke<RustAnkiResult>('import_apkg', bytes);
}
export function importApkgPath(path: string) {
  return invoke<RustAnkiResult>('import_apkg_path', { path });
}

// ---------- network (AI providers) ----------
type FetchRes = { status: number; statusText: string; contentType: string; body: string };

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * fetch() for AI requests. In the desktop app the request is sent by the Rust core,
 * so providers that block requests from browsers (CORS) and local servers work too.
 */
export async function netFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!inTauri) return fetch(url, init);
  if (init.signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
  const headers: Record<string, string> = {};
  new Headers(init.headers ?? {}).forEach((v, k) => (headers[k] = v));
  const body = typeof init.body === 'string' ? init.body : init.body == null ? undefined : String(init.body);
  const call = invoke<FetchRes>('http_fetch', { req: { url, method: init.method ?? 'GET', headers, body } }).then(
    (r) =>
      new Response(r.status === 204 || r.status === 304 ? null : b64ToBytes(r.body), {
        status: r.status,
        statusText: r.statusText,
        headers: r.contentType ? { 'content-type': r.contentType } : {},
      }),
    (e) => {
      throw new TypeError(String(e));
    },
  );
  if (!init.signal) return call;
  const signal = init.signal;
  return Promise.race([
    call,
    new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Abgebrochen', 'AbortError')), { once: true })),
  ]);
}

// ---------- self-test used when building ----------
export async function smokeInfo() {
  if (!inTauri) return null;
  try {
    return await invoke<{ apkg: string | null } | null>('smoke_info');
  } catch {
    return null;
  }
}
export const smokeDone = (report: unknown, exit = true) => invoke('smoke_done', { report, exit });

// ---------- files for the user (Downloads folder) ----------
/** Saves a file into Downloads and shows it in the file manager. Returns the full path. */
export async function saveDownload(name: string, data: Blob | string): Promise<string> {
  const blob = typeof data === 'string' ? new Blob([data]) : data;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return invoke<string>('save_download', bytes, { headers: { 'x-name': encodeURIComponent(name) } });
}
export type ExportDeckPayload = {
  name: string;
  cards: { front: string; back: string; tags?: string[]; styleId?: string }[];
  styles: Record<string, string>;
};
/** Writes the deck as Anki package (.apkg) into Downloads. Returns the full path. */
export const exportApkg = (deck: ExportDeckPayload) => invoke<string>('export_apkg', { deck });

// ---------- tray, autostart, notifications, full screen ----------
export const setTrayMode = (on: boolean) => (inTauri ? invoke('set_tray_mode', { on }).catch(() => undefined) : Promise.resolve());

export async function autostartEnabled(): Promise<boolean> {
  if (!inTauri) return false;
  try {
    return await (await import('@tauri-apps/plugin-autostart')).isEnabled();
  } catch {
    return false;
  }
}
export async function setAutostart(on: boolean) {
  const a = await import('@tauri-apps/plugin-autostart');
  if (on) await a.enable();
  else await a.disable();
}

/** System notification (desktop: Windows/macOS/Linux notification; browser: Notification API). */
export async function notify(title: string, body: string): Promise<boolean> {
  try {
    if (inTauri) {
      const n = await import('@tauri-apps/plugin-notification');
      let ok = await n.isPermissionGranted();
      if (!ok) ok = (await n.requestPermission()) === 'granted';
      if (ok) n.sendNotification({ title, body });
      return ok;
    }
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return false;
    new Notification(title, { body, icon: '/favicon.svg' });
    return true;
  } catch {
    return false;
  }
}

export async function setFullscreen(on: boolean) {
  try {
    if (inTauri) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(on);
    } else if (on) await document.documentElement.requestFullscreen?.();
    else if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* full screen not available */
  }
}

// ---------- backups ----------
export type BackupInfo = { path: string; name: string; modified: number; size: number; place: string };
export const getBackupDir = () => invoke<string | null>('get_backup_dir');
export const setBackupDir = (dir: string | null) => invoke('set_backup_dir', { dir });
export const listBackups = () => invoke<BackupInfo[]>('list_backups');
export const readBackup = (path: string) => invoke<string>('read_backup', { path });
export const backupNow = () => invoke<string>('backup_now');
export async function pickFolder(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const r = await open({ directory: true, multiple: false, title: 'Ordner für Sicherungen wählen' });
  return typeof r === 'string' ? r : null;
}
