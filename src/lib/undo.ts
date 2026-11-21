/**
 * Undo instead of „Wirklich löschen?“: an action runs at once, and for a few seconds a toast offers „Rückgängig“.
 * Undo brings back exactly what the action removed or changed – later changes elsewhere stay.
 */
import { useSyncExternalStore } from 'react';
import { getState, update, type Data } from './store';

type Item = Record<string, unknown>;
const LISTS = ['workspaces', 'courses', 'decks', 'reviews', 'jobs', 'exams', 'todos', 'skills'] as const;

/**
 * Pure: `before` and `after` are the data right before and after the action, `current` is the data now.
 * Items the action removed come back at their old place; items it changed get their old version back
 * (only if nobody changed them since); its deletion marks are dropped.
 */
export function restoreChange(before: Data, after: Data, current: Data): Data {
  const out: Data = { ...current };
  for (const key of LISTS) {
    const b = (before[key] ?? []) as Item[];
    const a = (after[key] ?? []) as Item[];
    if (b === a) continue;
    const afterSet = new Set(a);
    let cur = [...((current[key] ?? []) as Item[])];
    b.forEach((old, index) => {
      if (afterSet.has(old)) return; // untouched by the action
      const id = old.id as string | undefined;
      if (id === undefined) {
        if (!cur.includes(old)) cur.splice(Math.min(index, cur.length), 0, old);
        return;
      }
      const now = cur.findIndex((x) => x.id === id);
      const fresh = 'updatedAt' in old ? { ...old, updatedAt: Date.now() } : old;
      if (now < 0) cur.splice(Math.min(index, cur.length), 0, fresh);
      else if (cur[now] === a.find((x) => x.id === id)) cur[now] = fresh; // still the action's version
    });
    // items the action added (rare) are left alone
    cur = cur.filter(Boolean);
    (out as Record<string, unknown>)[key] = cur;
  }
  const marks = { ...(current.deleted ?? {}) };
  for (const k of Object.keys(after.deleted ?? {})) if (!(before.deleted ?? {})[k]) delete marks[k];
  out.deleted = marks;
  return out;
}

type Offer = { id: number; text: string; undo: () => void };
let offer: Offer | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Runs a (deleting) action now and offers „Rückgängig“ for 8 seconds. */
export function undoable(text: string, run: () => void) {
  const before = getState().data;
  run();
  const after = getState().data;
  if (before === after) return;
  clearTimeout(timer);
  const id = Date.now();
  offer = {
    id,
    text,
    undo: () => {
      update((d) => restoreChange(before, after, d));
      dismissUndo();
    },
  };
  emit();
  timer = setTimeout(() => offer?.id === id && dismissUndo(), 8000);
}

export function dismissUndo() {
  offer = null;
  emit();
}

export function useUndoOffer() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => offer,
  );
}
