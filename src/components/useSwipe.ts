import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { swipeRating as rawRating } from '../lib/phone';

/** Far enough sideways (about a quarter of the card) → 1 or 3, else 0. */
const swipeRating = (dx: number, width: number): 0 | 1 | 3 => rawRating(dx, 0, Math.max(70, width * 0.28)) ?? 0;

/**
 * Swiping a flashcard on the phone (after it is turned): the card follows the finger and tilts;
 * far enough to the right = „Gut“, to the left = „Nochmal“; otherwise it springs back.
 * Only touch and pen – the mouse keeps clicking. Returns props for the card element.
 */
export function useSwipe(enabled: boolean, onRate: (r: 1 | 3) => void) {
  const start = useRef<{ x: number; y: number; id: number; dx: number; horizontal: boolean | null } | null>(null);
  const reset = (el: HTMLElement, animate: boolean) => {
    el.style.transition = animate ? 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)' : '';
    el.style.transform = '';
    delete el.dataset.swipe;
  };
  return {
    'data-swipeable': enabled ? 'true' : undefined,
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || e.pointerType === 'mouse') return;
      if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, horizontal: null };
      e.currentTarget.style.transition = 'none';
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      // decide once: sideways = swipe, up/down = scroll the page
      if (s.horizontal === null && Math.abs(dx) + Math.abs(dy) > 10) s.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!s.horizontal) return;
      s.dx = dx;
      const el = e.currentTarget;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      const r = swipeRating(dx, el.offsetWidth);
      if (r === 3) el.dataset.swipe = 'right';
      else if (r === 1) el.dataset.swipe = 'left';
      else delete el.dataset.swipe;
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      if (!s || !s.horizontal) return;
      const el = e.currentTarget;
      const r = swipeRating(s.dx, el.offsetWidth);
      if (!r) return reset(el, true);
      // fly out to the side, then rate (the next card comes in)
      el.style.transition = 'transform 0.18s ease-in';
      el.style.transform = `translateX(${r === 3 ? 140 : -140}%) rotate(${r === 3 ? 16 : -16}deg)`;
      window.setTimeout(() => {
        reset(el, false);
        onRate(r);
      }, 170);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      start.current = null;
      reset(e.currentTarget, true);
    },
  };
}
