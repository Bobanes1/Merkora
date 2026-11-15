/**
 * In-app updates for the Android app: look for a newer release on GitHub, download its APK (Rust core)
 * and hand it to the phone's installer (MerkoraAndroid bridge in MainActivity). The person confirms "Installieren".
 */
import { useSyncExternalStore } from 'react';
import { APP_VERSION } from '../config';

const LATEST = 'https://github.com/Bobanes1/Merkora/releases/latest/download/latest.json';
export const apkUrl = (v: string) => `https://github.com/Bobanes1/Merkora/releases/download/v${v}/Merkora_${v}_android.apk`;
const CHECK_EVERY = 6 * 60 * 60 * 1000;
const LAST_CHECK = 'merkora.apkCheck';

/** Is version a newer than b? ("0.9.10" > "0.9.9"; a leading "v" is ignored.) Pure – tested. */
export function isNewerVersion(a: string, b: string): boolean {
  const parts = (v: string) => v.trim().replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

export type ApkState = {
  status: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'ready' | 'permission' | 'error';
  version?: string;
  notes?: string;
  progress?: number;
  error?: string;
  hidden?: boolean;
};
let state: ApkState = { status: 'idle' };
const subs = new Set<() => void>();
const set = (p: Partial<ApkState>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
export const useApkUpdate = () =>
  useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => state,
    () => state,
  );
export const hideApkNotice = () => set({ hidden: true });

export async function checkApkUpdate(manual = false): Promise<void> {
  if (!manual) {
    try {
      const last = Number(localStorage.getItem(LAST_CHECK) || 0);
      if (Date.now() - last < CHECK_EVERY) return;
    } catch {
      /* no storage: check anyway */
    }
  }
  set({ status: 'checking', error: undefined });
  try {
    const { netFetch } = await import('./desktop');
    const res = await netFetch(LATEST + '?t=' + Date.now());
    if (!res.ok) throw new Error(`GitHub antwortet nicht (${res.status}).`);
    const j = (await res.json()) as { version?: string; notes?: string };
    const v = String(j.version ?? '').replace(/^v/i, '');
    try {
      localStorage.setItem(LAST_CHECK, String(Date.now()));
    } catch {
      /* no storage */
    }
    if (v && isNewerVersion(v, APP_VERSION)) set({ status: downloadedFor(v) ? 'ready' : 'available', version: v, notes: j.notes, hidden: false });
    else set({ status: 'none' });
  } catch (e) {
    set({ status: manual ? 'error' : 'idle', error: `Suche nach Updates fehlgeschlagen: ${(e as Error).message}` });
  }
}

type Bridge = { installApk: (path: string) => string; installDownloaded?: () => string; hasDownloaded?: () => boolean };
const bridge = () => (window as unknown as { MerkoraAndroid?: Bridge }).MerkoraAndroid;
/** Which version's APK is already downloaded (so "Installieren" does not download it again). */
const DOWNLOADED = 'merkora.apkDownloaded';
function downloadedFor(v: string): boolean {
  try {
    return localStorage.getItem(DOWNLOADED) === v && !!bridge()?.hasDownloaded?.();
  } catch {
    return false;
  }
}

/** The answer of MainActivity after trying to open Android's installer ("ok" or "error: …"). */
function waitForInstaller(ms = 5000): Promise<string> {
  return new Promise((resolve) => {
    const w = window as unknown as { __merkoraInstallResult?: (r: string) => void };
    const t = setTimeout(() => {
      w.__merkoraInstallResult = laterAnswer;
      resolve('timeout');
    }, ms);
    w.__merkoraInstallResult = (r) => {
      clearTimeout(t);
      w.__merkoraInstallResult = laterAnswer;
      resolve(r);
    };
  });
}
/** Answers that come later – e.g. after "Aus dieser Quelle zulassen" MainActivity starts the installer by itself. */
const laterAnswer = (r: string) => set(afterInstallAnswer(r));
if (typeof window !== 'undefined') (window as unknown as { __merkoraInstallResult?: (r: string) => void }).__merkoraInstallResult = laterAnswer;

/** What the bridge answered → the next state of the banner. Pure – tested. */
export function afterInstallAnswer(r: string): Partial<ApkState> {
  if (r === 'ok' || r === 'timeout') return { status: 'installing' };
  if (r === 'permission') return { status: 'permission' };
  return { status: 'error', error: 'Android konnte den Installer nicht öffnen: ' + r.replace(/^error:\s*/, '') };
}

async function startInstaller(run: () => string) {
  const answer = waitForInstaller();
  const r = run();
  if (r === 'started') set(afterInstallAnswer(await answer));
  else set(afterInstallAnswer(r));
}

export async function installApkUpdate(): Promise<void> {
  if (!state.version) return;
  const v = state.version;
  const url = apkUrl(v);
  const b = bridge();
  const { invoke } = await import('@tauri-apps/api/core');
  const { openExternal } = await import('./desktop');
  if (!b) {
    // older app without the bridge: download in the browser
    openExternal(url);
    return;
  }
  set({ error: undefined });
  try {
    if (b.installDownloaded && downloadedFor(v)) {
      await startInstaller(() => b.installDownloaded!());
      return;
    }
    set({ status: 'downloading', progress: 0 });
    const { listen } = await import('@tauri-apps/api/event');
    const off = await listen<number>('apk-progress', (e) => set({ progress: e.payload }));
    let path: string;
    try {
      path = await invoke<string>('download_apk', { url });
    } finally {
      off();
    }
    set({ status: 'installing', progress: 1 });
    await startInstaller(() => b.installApk(path));
    try {
      localStorage.setItem(DOWNLOADED, v);
    } catch {
      /* no storage */
    }
  } catch (e) {
    set({ status: 'error', error: String((e as Error)?.message ?? e) });
  }
}

/** The APK in the browser – when Android's installer cannot be opened from the app. */
export async function downloadApkInBrowser() {
  if (!state.version) return;
  const { openExternal } = await import('./desktop');
  openExternal(apkUrl(state.version));
}

// back in Merkora without the update installed (installer closed, or "Später"): offer installing again
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.status === 'installing') setTimeout(() => state.status === 'installing' && set({ status: 'ready' }), 1500);
  });

export function startApkUpdateChecks() {
  setTimeout(() => void checkApkUpdate(), 4000);
}
