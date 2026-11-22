/**
 * Focus mode while practising: the sidebar and the bars disappear, one task fills the screen.
 * A view asks for it with useLearnFocus(true); whether it really turns on is the person's choice
 * (remembered on this device – „Fokus beenden“ switches it off for later lessons too).
 */
import { useEffect, useSyncExternalStore } from 'react';

const KEY = 'merkora.learnFocus';
const subs = new Set<() => void>();
let wanted = 0;

export function focusPreferred(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

function apply() {
  if (typeof document !== 'undefined') document.body.classList.toggle('learn-focus', wanted > 0 && focusPreferred());
}

export function setFocusPreferred(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* only for this visit then */
  }
  apply();
  subs.forEach((f) => f());
}

/** Asks for focus mode while `want` is true. Returns whether it is on and a switch for it. */
export function useLearnFocus(want: boolean): [boolean, (on: boolean) => void] {
  const preferred = useSyncExternalStore(
    (cb) => (subs.add(cb), () => void subs.delete(cb)),
    focusPreferred,
    () => false,
  );
  useEffect(() => {
    if (!want) return;
    wanted++;
    apply();
    return () => {
      wanted--;
      apply();
    };
  }, [want]);
  return [want && preferred, setFocusPreferred];
}
