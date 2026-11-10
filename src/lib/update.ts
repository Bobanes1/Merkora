/**
 * Updates of the desktop app: looks for a newer release on GitHub (signed `latest.json`),
 * downloads and installs it and restarts Merkora. Only active in the desktop app.
 */
import { useSyncExternalStore } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { inTauri } from './desktop';
import { flush } from './store';

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'error';
export type UpdateState = {
  status: UpdateStatus;
  version?: string;
  notes?: string;
  /** 0–1 while downloading (when the size is known). */
  progress?: number;
  error?: string;
  /** The notice was closed with "Später" (only for this start of the app). */
  hidden?: boolean;
  checkedAt?: number;
};

let state: UpdateState = { status: 'idle' };
let pending: Update | null = null;
const listeners = new Set<() => void>();
const set = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const useUpdate = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
  );

/** Asks GitHub whether a newer version exists. `manual`: show errors (otherwise checks stay silent). */
export async function checkForUpdate(manual = false): Promise<void> {
  if (!inTauri || state.status === 'downloading' || state.status === 'installing') return;
  if (manual) set({ status: 'checking', error: undefined });
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const upd = await check({ timeout: 30000 });
    if (upd) {
      pending = upd;
      set({ status: 'available', version: upd.version, notes: upd.body ?? '', checkedAt: Date.now(), hidden: manual ? false : state.hidden });
    } else set({ status: 'none', checkedAt: Date.now() });
  } catch (e) {
    if (manual) set({ status: 'error', error: friendly(e) });
    else if (state.status === 'checking') set({ status: 'idle' });
  }
}

/** Downloads the new version, installs it and restarts the app. */
export async function installUpdate(): Promise<void> {
  if (!pending) return;
  try {
    await flush();
    set({ status: 'downloading', progress: undefined, error: undefined });
    let total = 0;
    let done = 0;
    await pending.downloadAndInstall((ev) => {
      if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
      else if (ev.event === 'Progress') {
        done += ev.data.chunkLength;
        if (total) set({ progress: Math.min(1, done / total) });
      } else if (ev.event === 'Finished') set({ status: 'installing', progress: 1 });
    });
    set({ status: 'installing' });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    set({ status: 'error', error: friendly(e) });
  }
}

export const hideUpdateNotice = () => set({ hidden: true });

function friendly(e: unknown) {
  const msg = String((e as Error)?.message ?? e);
  if (/network|connect|dns|timed? ?out|request/i.test(msg)) return `Keine Verbindung zum Update-Server (${msg}).`;
  if (/signature/i.test(msg)) return `Das Update konnte nicht überprüft werden (Signatur). (${msg})`;
  return msg;
}

let started = false;
/** Checks a few seconds after the start and then every 6 hours. */
export function startUpdateChecks() {
  if (!inTauri || started) return;
  started = true;
  setTimeout(() => void checkForUpdate(), 8000);
  setInterval(() => void checkForUpdate(), 6 * 60 * 60 * 1000);
}
