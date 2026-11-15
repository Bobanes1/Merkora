import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** A panel that slides up from the bottom (phone view): tap outside or Esc closes it. */
export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <span className="sheet-grip" aria-hidden="true" />
        {title && <b className="sheet-title">{title}</b>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
