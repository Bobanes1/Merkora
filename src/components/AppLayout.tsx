import { useEffect, useState, type ReactNode } from 'react';
import { PipTip } from './PipTip';
import { MiniPlayer } from './MiniPlayer';
import { Tour } from './Tour';
import { UndoToast } from './UndoToast';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { aiReady, PROVIDERS } from '../lib/ai';
import { isAndroid, isDesktop, useStore } from '../lib/store';
import { SECOND_MODEL } from '../config';
import { CreateWithAI } from './CreateWithAI';
import { NewDeckModal } from './NewDeck';
import {
  IconCheck,
  IconClose,
  IconHome,
  IconKey,
  IconLibrary,
  IconMenu,
  IconSettings,
  IconTools,
  IconChart,
  IconPlus,
  IconSearch,
  IconPractice,
  IconSidebar,
} from './Icons';
import { SearchPalette } from './SearchPalette';
import { PhoneNav } from './PhoneNav';
import { usePhone } from '../lib/phone';
import { InstallButton } from './InstallButton';
import { JobsIndicator } from './Jobs';
import { Logo } from './Logo';
import { ErrorBoundary } from './ErrorBoundary';
import { UpdateNotice } from './UpdateNotice';
import { ApkUpdateNotice } from './ApkUpdate';
import { MasterySnapshots } from './WeekReview';
import { FocusBar, setFocus } from './Pomodoro';
import { ToolWindows } from './tools/ToolWindows';
import { fmtClock, usePomodoro } from '../lib/pomodoro';
import { remaining } from '../lib/pomodoroRule';
import { toolWindows, useToolWindows } from '../lib/toolWindows';

/** „Merkora Tools“ in the sidebar: one plain entry; it shows the running timer or the open to-dos. */
function SidebarToolbar({ onNavigate }: { onNavigate: () => void }) {
  const p = usePomodoro();
  const openTodos = useStore((s) => (s.data.todos ?? []).filter((t) => !t.doneAt).length);
  const pomoClock = p.running ? fmtClock(remaining(p, Date.now())) : null;
  return (
    <NavLink to="/tools" onClick={onNavigate} title="Merkora Tools" className={({ isActive }) => `nav-link nav-c-tools ${isActive ? 'active' : ''}`}>
        <IconTools /> <span className="grow nav-text">Merkora Tools</span>
        {pomoClock ? (
          <span className="pill-count pomo-pill" title="Pomodoro läuft">{pomoClock}</span>
        ) : (
          openTodos > 0 && (
            <span className="pill-count soft" title={`${openTodos} offene To-dos`}>
              {openTodos}
            </span>
          )
        )}
    </NavLink>
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

const SIDEBAR_KEY = 'merkora.sidebarCollapsed';

/** Which area a page belongs to (colour, background and header picture of the area). */
export function areaOf(pathname: string): string {
  if (pathname.startsWith('/library/') && pathname.split('/').filter(Boolean).length >= 4) return 'deck';
  for (const a of ['library', 'skills', 'tools', 'stats', 'settings']) if (pathname.startsWith('/' + a)) return a;
  return 'start';
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [newDeck, setNewDeck] = useState(false);
  const [aiCourse, setAiCourse] = useState<string | null>(null);
  // Strg+K / ⌘K or "/" (outside text fields): search everything
  const [search, setSearch] = useState(false);
  // the sidebar can be folded to a narrow strip of icons (remembered on this device)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1');
      } catch {
        /* private mode: just not remembered */
      }
      return !c;
    });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'B') && !typing) {
        e.preventDefault();
        toggleCollapsed();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearch(true);
      } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const apiKey = useStore((s) => s.apiKey);
  const provider = useStore((s) => s.data.settings.provider);
  const { pathname } = useLocation();
  useEffect(() => {
    setOpen(false);
    setFocus(false);
  }, [pathname]);
  const close = () => setOpen(false);
  const chatSeparate = useStore((s) => s.data.settings.chatSeparate);
  const chatProvider = useStore((s) => s.data.settings.chatProvider);
  const ready = useStore((s) => aiReady(s));
  const connected = !!apiKey || provider === 'custom';
  const phone = usePhone();

  return (
    <div className="app-shell">
      {phone ? (
        <header className="mobile-bar phone-bar">
          <Logo className="small" />
          <button type="button" className="icon-btn" aria-label="Suchen" onClick={() => setSearch(true)}>
            <IconSearch size={22} />
          </button>
        </header>
      ) : (
        <header className="mobile-bar">
          <button type="button" className="icon-btn" aria-label="Menü öffnen" onClick={() => setOpen(true)}>
            <IconMenu size={22} />
          </button>
          <Logo className="small" />
          <span style={{ width: 36 }} />
        </header>
      )}
      <nav className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`} aria-label="Hauptnavigation">
        <div className="sidebar-top">
          <Logo className="small" />
          <button
            type="button"
            className="icon-btn sidebar-collapse"
            aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
            title={collapsed ? 'Seitenleiste ausklappen (Strg B)' : 'Seitenleiste einklappen (Strg B)'}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            <IconSidebar size={18} />
          </button>
          <button type="button" className="icon-btn mobile-only" aria-label="Menü schließen" onClick={close}>
            <IconClose />
          </button>
        </div>
        <button type="button" className="new-deck-btn" title="Neues Deck" onClick={() => setNewDeck(true)}>
          <span className="plus">
            <IconPlus size={16} />
          </span>
          <span className="nav-text">Neues Deck</span>
        </button>
        <button type="button" className="search-btn" onClick={() => setSearch(true)} title="Karten, Decks und Kurse durchsuchen">
          <IconSearch size={16} />
          <span className="nav-text">Suchen …</span>
          <kbd>Strg K</kbd>
        </button>
        <div className="nav-main">
          <NavLink to="/dashboard" title="Start" className={({ isActive }) => `nav-link nav-c1 ${isActive ? 'active' : ''}`}>
            <IconHome /> <span className="nav-text">Start</span>
          </NavLink>
          <NavLink to="/library" end title="Bibliothek" className={({ isActive }) => `nav-link nav-c2 ${isActive ? 'active' : ''}`}>
            <IconLibrary /> <span className="nav-text">Bibliothek</span>
          </NavLink>
          <NavLink to="/skills" title="Skills" className={({ isActive }) => `nav-link nav-c3 ${isActive ? 'active' : ''}`}>
            <IconPractice /> <span className="nav-text">Skills</span>
          </NavLink>
          <NavLink to="/stats" title="Statistik" className={({ isActive }) => `nav-link nav-c5 ${isActive ? 'active' : ''}`}>
            <IconChart /> <span className="nav-text">Statistik</span>
          </NavLink>
          <SidebarToolbar onNavigate={close} />
          <NavLink to="/settings" title="Einstellungen" className={({ isActive }) => `nav-link nav-c6 ${isActive ? 'active' : ''}`}>
            <IconSettings /> <span className="nav-text">Einstellungen</span>
          </NavLink>
        </div>
        <MiniPlayer onNavigate={close} />
        <span className="grow sidebar-spacer" />
        <JobsIndicator />
        {!isDesktop && <InstallButton />}
        <SaveState />
        <Link to="/settings#ki" title={connected && ready ? 'KI verbunden' : 'Kein API-Key'} className={`ai-status ${connected ? 'ok' : ''}`}>
          <IconKey size={16} />
          <span>
            <b>{connected && ready ? 'KI verbunden' : 'Kein API-Key'}</b>
            <small>{connected && ready
                ? PROVIDERS[provider].short + (SECOND_MODEL && chatSeparate ? ` · Chat: ${PROVIDERS[chatProvider].short}` : '')
                : 'Jetzt hinterlegen'}</small>
          </span>
        </Link>
      </nav>
      {open && <div className="sidebar-backdrop" onClick={close} />}
      {newDeck && <NewDeckModal onClose={() => setNewDeck(false)} onAi={(courseId) => setAiCourse(courseId)} />}
      {aiCourse && <CreateWithAI courseId={aiCourse} onClose={() => setAiCourse(null)} onBack={() => (setAiCourse(null), setNewDeck(true))} />}
      {search && <SearchPalette onClose={() => setSearch(false)} />}
      <UndoToast />
      <PipTip area={areaOf(pathname)} />
      <Tour />
      {phone && <MiniPlayer phone />}
      {phone && <PhoneNav onSearch={() => setSearch(true)} onNewDeck={() => setNewDeck(true)} />}
      <ToolWindows />
      <main className="app-main" data-area={areaOf(pathname)}>
        <FocusBar />
        {isAndroid ? <ApkUpdateNotice /> : <UpdateNotice />}
        <MasterySnapshots />
        <ErrorBoundary key={pathname} inline>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
