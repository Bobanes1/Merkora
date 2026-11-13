import type { ReactNode } from 'react';
import { IconChevronDown } from './Icons';

/** A panel whose heading opens and closes it (state kept by the caller, e.g. in the settings). */
export function FoldPanel({
  title,
  summary,
  collapsed,
  onToggle,
  actions,
  children,
  className = '',
}: {
  title: ReactNode;
  summary?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel fold-panel ${collapsed ? 'folded' : ''} ${className}`}>
      <div className="fold-head">
        <button type="button" className="fold-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          <IconChevronDown size={16} className="fold-chev" />
          <h2>{title}</h2>
          {summary && <small className="muted fold-sum">{summary}</small>}
        </button>
        {actions && !collapsed && <span className="row-gap">{actions}</span>}
      </div>
      {!collapsed && <div className="fold-body">{children}</div>}
    </section>
  );
}
