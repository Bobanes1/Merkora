import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { clampPos, toolWindows, type ToolWindowId, type ToolWindowState } from '../../lib/toolWindows';
import { IconClose, IconMinus } from '../Icons';

type Props = {
  id: ToolWindowId;
  win: ToolWindowState;
  title: string;
  badge?: string;
  icon?: ReactNode;
  defaultPos: { right: number; bottom?: number; top?: number };
  width?: number;
  children: ReactNode;
};

/**
 * Draggable, minimizable floating popup window for Merkora Tools.
 * Persists across page navigation while mounted in AppLayout.
 */
export function FloatingWindow({ id, win, title, badge, icon, defaultPos, width = 340, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // safety net: releasing the mouse anywhere ends a drag
  useEffect(() => {
    const end = () => (drag.current = null);
    window.addEventListener('pointerup', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('blur', end);
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (win.x == null || win.y == null || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const maxX = Math.max(8, window.innerWidth - rect.width - 8);
      const maxY = Math.max(8, window.innerHeight - 48);
      const nx = Math.min(Math.max(8, win.x), maxX);
      const ny = Math.min(Math.max(8, win.y), maxY);
      if (nx !== win.x || ny !== win.y) toolWindows.move(id, nx, ny);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [id, win.x, win.y]);

  if (!win.open) return null;

  // Dragging by the title bar. The pointer is captured by the title bar itself (not the whole window), so
  // move and release always reach these handlers; any end of the gesture stops dragging.
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    toolWindows.focus(id);
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not supported: the window listener below still ends the drag */
    }
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current || !ref.current) return;
    // the button is no longer pressed (release happened outside the window): stop
    if (e.pointerType === 'mouse' && e.buttons === 0) return stopDrag();
    const rect = ref.current.getBoundingClientRect();
    const p = clampPos(e.clientX - drag.current.dx, e.clientY - drag.current.dy, rect.width, window.innerWidth, window.innerHeight);
    toolWindows.move(id, p.x, p.y);
  };

  const stopDrag = (e?: ReactPointerEvent<HTMLElement>) => {
    drag.current = null;
    if (e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
  };

  const style: React.CSSProperties =
    win.x != null && win.y != null
      ? { left: win.x, top: win.y, zIndex: win.z, width: win.minimized ? undefined : width }
      : {
          right: defaultPos.right,
          bottom: defaultPos.bottom,
          top: defaultPos.top,
          zIndex: win.z,
          width: win.minimized ? undefined : width,
        };

  return (
    <section
      ref={ref}
      className={`tool-win ${win.minimized ? 'minimized' : ''}`}
      data-mode={id}
      style={style}
      aria-label={title}
      onMouseDown={() => toolWindows.focus(id)}
    >
      <header
        className="tool-win-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onLostPointerCapture={() => (drag.current = null)}
      >
        <span className="tool-win-title">
          {icon}
          <b>{title}</b>
          {badge && <span className="tool-win-badge">{badge}</span>}
        </span>
        <span className="tool-win-actions">
          <button
            type="button"
            className="icon-btn sm"
            aria-label={win.minimized ? 'Vergrößern' : 'Minimieren'}
            title={win.minimized ? 'Vergrößern' : 'Minimieren'}
            onClick={() => toolWindows.toggleMinimize(id)}
          >
            <IconMinus size={14} />
          </button>
          <button
            type="button"
            className="icon-btn sm"
            aria-label="Schließen"
            title="Schließen"
            onClick={() => toolWindows.close(id)}
          >
            <IconClose size={14} />
          </button>
        </span>
      </header>
      {!win.minimized && <div className="tool-win-body">{children}</div>}
    </section>
  );
}
