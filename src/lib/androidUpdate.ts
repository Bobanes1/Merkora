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
  status: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'permission' | 'error';
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
      localStorage.setItem(LAST_CHECK, String(Date.now()));
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
    if (v && isNewerVersion(v, APP_VERSION)) set({ status: 'available', version: v, notes: j.notes, hidden: false });
    else set({ status: 'none' });
  } catch (e) {
    set({ status: manual ? 'error' : 'idle', error: `Suche nach Updates fehlgeschlagen: ${(e as Error).message}` });
  }
}

type Bridge = { installApk: (path: string) => string };

export async function installApkUpdate(): Promise<void> {
  if (!state.version) return;
  const url = apkUrl(state.version);
  const bridge = (window as unknown as { MerkoraAndroid?: Bridge }).MerkoraAndroid;
  const { invoke } = await import('@tauri-apps/api/core');
  const { openExternal } = await import('./desktop');
  if (!bridge) {
    // older app without the bridge: download in the browser
    openExternal(url);
    return;
  }
  set({ status: 'downloading', progress: 0, error: undefined });
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const off = await listen<number>('apk-progress', (e) => set({ progress: e.payload }));
    let path: string;
    try {
      path = await invoke<string>('download_apk', { url });
    } finally {
      off();
    }
    set({ status: 'installing', progress: 1 });
    const r = bridge.installApk(path);
    if (r === 'permission') set({ status: 'permission' });
    else if (r !== 'ok') throw new Error(r.replace(/^error:\s*/, ''));
  } catch (e) {
    set({ status: 'error', error: String((e as Error)?.message ?? e) });
  }
}

export function startApkUpdateChecks() {
  setTimeout(() => void checkApkUpdate(), 4000);
}
