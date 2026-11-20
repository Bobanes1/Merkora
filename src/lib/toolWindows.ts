/**
 * Floating popup window state for Merkora Tools (Pomodoro, To-do-Liste).
 * Shared across the sidebar toolbar, /tools page, and global ToolWindows overlay.
 */
import { useSyncExternalStore } from 'react';

export type ToolWindowId = 'pomodoro' | 'todos';

export type ToolWindowState = {
  open: boolean;
  minimized: boolean;
  z: number;
  x?: number;
  y?: number;
};

type WindowsMap = Record<ToolWindowId, ToolWindowState>;

let zCounter = 40;
let state: WindowsMap = {
  pomodoro: { open: false, minimized: false, z: 40 },
  todos: { open: false, minimized: false, z: 41 },
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
};

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
