import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { toolWindows, type ToolWindowId, type ToolWindowState } from '../../lib/toolWindows';
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

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    toolWindows.focus(id);
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - 48);
    const nx = Math.min(Math.max(8, e.clientX - drag.current.dx), maxX);
    const ny = Math.min(Math.max(8, e.clientY - drag.current.dy), maxY);
    toolWindows.move(id, nx, ny);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    try {
      ref.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
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
      style={style}
      aria-label={title}
      onMouseDown={() => toolWindows.focus(id)}
    >
      <header
        className="tool-win-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
