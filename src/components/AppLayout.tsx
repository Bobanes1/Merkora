import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { aiReady, PROVIDERS, usingFree } from '../lib/ai';
import { deckUrl, dueCards, isDesktop, useStore } from '../lib/store';
import {
  IconCheck,
  IconChevron,
  IconChevronDown,
  IconClose,
  IconHome,
  IconKey,
  IconLibrary,
  IconMenu,
  IconSettings,
  IconCalendar,
  IconChart,
} from './Icons';
import { InstallButton } from './InstallButton';
import { JobsIndicator } from './Jobs';
import { Logo } from './Logo';
import { ErrorBoundary } from './ErrorBoundary';
import { UpdateNotice } from './UpdateNotice';
import { FocusBar, Pomodoro, setFocus } from './Pomodoro';

function Tree({ onNavigate }: { onNavigate: () => void }) {
  const data = useStore((s) => s.data);
  const { pathname } = useLocation();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setClosed((c) => ({ ...c, [id]: !c[id] }));
  return (
    <div className="tree">
      {data.workspaces.map((w) => (
        <div key={w.id} className="tree-ws">
          <button type="button" className="tree-head" onClick={() => toggle(w.id)}>
            {closed[w.id] ? <IconChevron size={14} /> : <IconChevronDown size={14} />}
            <span>{w.name}</span>
          </button>
          {!closed[w.id] &&
            data.courses
              .filter((c) => c.workspaceId === w.id)
              .map((c) => (
                <div key={c.id} className="tree-course">
                  <NavLink
                    to={`/library/${w.slug}/${c.slug}`}
                    end
                    onClick={onNavigate}
                    className={({ isActive }) => `tree-link course ${isActive ? 'active' : ''}`}
                  >
                    {c.name}
                  </NavLink>
                  {data.decks
                    .filter((d) => d.courseId === c.id)
                    .map((d) => {
                      const url = deckUrl(data, d);
                      const due = dueCards(d).length;
                      return (
                        <Link key={d.id} to={url} onClick={onNavigate} className={`tree-link deck ${pathname === url ? 'active' : ''}`}>
                          <span className="tree-name">{d.name}</span>
                          {due > 0 && <span className="pill-count">{due}</span>}
                        </Link>
                      );
                    })}
                </div>
              ))}
        </div>
      ))}
    </div>
  );
}

/** Shows that the learning progress is saved automatically. */
function SaveState() {
  const savedAt = useStore((s) => s.savedAt);
  const warning = useStore((s) => s.storageWarning);
  if (warning)
    return (
      <div className="save-state bad" role="alert">
        {warning}
      </div>
    );
  return (
    <div className="save-state" title="Merkora speichert deinen Lernstand automatisch – kurz nach jeder Änderung.">
      <IconCheck size={13} /> Automatisch gespeichert
      {savedAt ? ` · ${new Date(savedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const apiKey = useStore((s) => s.apiKey);
  const provider = useStore((s) => s.data.settings.provider);
  const { pathname } = useLocation();
  useEffect(() => {
    setOpen(false);
    setFocus(false);
  }, [pathname]);
  const close = () => setOpen(false);
  const free = useStore((s) => usingFree(s));
  const chatSeparate = useStore((s) => s.data.settings.chatSeparate);
  const chatProvider = useStore((s) => s.data.settings.chatProvider);
  const ready = useStore((s) => aiReady(s));
  const connected = !!apiKey || provider === 'custom' || free;

  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <button type="button" className="icon-btn" aria-label="Menü öffnen" onClick={() => setOpen(true)}>
          <IconMenu size={22} />
        </button>
        <Logo className="small" />
        <span style={{ width: 36 }} />
      </header>
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Hauptnavigation">
        <div className="sidebar-top">
          <Logo className="small" />
          <button type="button" className="icon-btn mobile-only" aria-label="Menü schließen" onClick={close}>
            <IconClose />
          </button>
        </div>
        <div className="nav-main">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconHome /> Übersicht
          </NavLink>
          <NavLink to="/library" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconLibrary /> Bibliothek
          </NavLink>
          <NavLink to="/calendar" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconCalendar /> Kalender
          </NavLink>
          <NavLink to="/stats" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconChart /> Statistik
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconSettings /> Einstellungen
          </NavLink>
        </div>
        <div className="nav-section">Meine Kurse</div>
        <Tree onNavigate={close} />
        <Pomodoro />
        <JobsIndicator />
        {!isDesktop && <InstallButton />}
        <SaveState />
        <Link to="/settings" className={`ai-status ${connected ? 'ok' : ''}`}>
          <IconKey size={16} />
          <span>
            <b>{connected && ready ? (free ? 'Kostenlose KI aktiv' : 'KI verbunden') : 'Kein API-Key'}</b>
            <small>{connected && ready
                ? (free ? 'Nemotron · eigener Key möglich' : PROVIDERS[provider].short) + (chatSeparate ? ` · Chat: ${PROVIDERS[chatProvider].short}` : '')
                : 'Jetzt hinterlegen'}</small>
          </span>
        </Link>
      </nav>
      {open && <div className="sidebar-backdrop" onClick={close} />}
      <main className="app-main">
        <FocusBar />
        <UpdateNotice />
        <ErrorBoundary key={pathname} inline>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
