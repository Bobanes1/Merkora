/**
 * Phone view: narrow screens (up to 700 px) and always in the Android app.
 * Sets the class "phone" on <html> (the CSS uses it) and offers usePhone() for parts that look different.
 */
import { useSyncExternalStore } from 'react';
import { isAndroid } from './desktop';

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 700px)') : null;
const isPhone = () => isAndroid || !!mq?.matches;

export function initPhone() {
  const apply = () => document.documentElement.classList.toggle('phone', isPhone());
  apply();
  mq?.addEventListener('change', apply);
}

const subscribe = (cb: () => void) => {
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
};
export const usePhone = () => useSyncExternalStore(subscribe, isPhone, () => false);

/** Swiping a flipped card while learning: left = "Nochmal" (1), right = "Gut" (3); short or mostly vertical moves count as a tap. */
export function swipeRating(dx: number, dy: number, min = 70): 1 | 3 | null {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 1 : 3;
}
