/**
 * Floating popup window state for Merkora Tools (Pomodoro, To-do-Liste).
 * Shared across the sidebar toolbar, /tools page, and global ToolWindows overlay.
 */
import { useSyncExternalStore } from 'react';

export type ToolWindowId = 'pomodoro' | 'todos' | 'sounds' | 'notes' | 'calc';

export type ToolWindowState = {
  open: boolean;
  minimized: boolean;
  z: number;
  x?: number;
  y?: number;
};

type WindowsMap = Record<ToolWindowId, ToolWindowState>;

let zCounter = 45;
let state: WindowsMap = {
  pomodoro: { open: false, minimized: false, z: 40 },
  todos: { open: false, minimized: false, z: 41 },
  sounds: { open: false, minimized: false, z: 42 },
  notes: { open: false, minimized: false, z: 43 },
  calc: { open: false, minimized: false, z: 44 },
};

const listeners = new Set<() => void>();
const emit = () => {
  state = { ...state };
  listeners.forEach((l) => l());
};

export const toolWindows = {
  open(id: ToolWindowId) {
    zCounter++;
    state = { ...state, [id]: { ...state[id], open: true, minimized: false, z: zCounter } };
    emit();
  },
  close(id: ToolWindowId) {
    if (!state[id].open) return;
    state = { ...state, [id]: { ...state[id], open: false, minimized: false } };
    emit();
  },
  toggle(id: ToolWindowId) {
    if (state[id].open && !state[id].minimized) this.close(id);
    else this.open(id);
  },
  toggleMinimize(id: ToolWindowId) {
    zCounter++;
    state = { ...state, [id]: { ...state[id], minimized: !state[id].minimized, z: zCounter } };
    emit();
  },
  focus(id: ToolWindowId) {
    if (state[id].z === zCounter) return;
    zCounter++;
    state = { ...state, [id]: { ...state[id], z: zCounter } };
    emit();
  },
  move(id: ToolWindowId, x: number, y: number) {
    state = { ...state, [id]: { ...state[id], x, y } };
    emit();
  },
  get(): WindowsMap {
    return state;
  },
};

/** A window position kept on screen (8 px margin; the title bar always stays reachable). Pure – tested. */
export function clampPos(x: number, y: number, width: number, viewW: number, viewH: number): { x: number; y: number } {
  const maxX = Math.max(8, viewW - width - 8);
  const maxY = Math.max(8, viewH - 48);
  return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) };
}

export function useToolWindows(): WindowsMap {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
  );
}
