import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';

export function Modal({
  title,
  onClose,
  children,
  wide,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Only the top-most window reacts to Escape (windows can open on top of each other).
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const all = document.querySelectorAll('.modal-backdrop');
      if (all[all.length - 1] === backdrop.current) onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div ref={backdrop} className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Small text prompt dialog (name a workspace, rename a deck...). */
export function PromptModal({
  title,
  label,
  initial = '',
  confirm = 'Speichern',
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  confirm?: string;
  onSubmit: (v: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const submit = () => {
    if (!v.trim()) return;
    onSubmit(v.trim());
    onClose();
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={submit} disabled={!v.trim()}>
            {confirm}
          </button>
        </>
      }
    >
      <label className="field-label" htmlFor="prompt-input">
        {label}
      </label>
      <input
        id="prompt-input"
        ref={ref}
        className="input"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
    </Modal>
  );
}

export function ConfirmModal({
  title,
  text,
  confirm = 'Löschen',
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirm?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirm}
          </button>
        </>
      }
    >
      <p className="muted">{text}</p>
    </Modal>
  );
}
