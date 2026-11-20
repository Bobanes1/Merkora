import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { aiReady, PROVIDERS } from '../lib/ai';
import { deckUrl, dueCards, isAndroid, isDesktop, useStore, type Deck } from '../lib/store';
import { SECOND_MODEL } from '../config';
import { CreateWithAI } from './CreateWithAI';
import { shortNames } from '../lib/deckNames';
import { NewDeckModal } from './NewDeck';
import {
  IconCheck,
  IconChecklist,
  IconChevron,
  IconChevronDown,
  IconClose,
  IconHome,
  IconKey,
  IconLibrary,
  IconMenu,
  IconSettings,
  IconSparkle,
  IconTimer,
  IconTools,
  IconCalendar,
  IconChart,
  IconFolder,
  IconPlus,
  IconSearch,
  IconPractice,
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

/** Collapsible Merkora Toolbar menu in the left sidebar. */
function SidebarToolbar({ onNavigate }: { onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const wins = useToolWindows();
  const p = usePomodoro();
  const openTodos = useStore((s) => (s.data.todos ?? []).filter((t) => !t.doneAt).length);
  const { pathname } = useLocation();
  const pomoClock = p.running ? fmtClock(remaining(p, Date.now())) : null;

  return (
    <div className="sidebar-toolbar">
      <div className="toolbar-head">
        <NavLink to="/tools" onClick={onNavigate} className={({ isActive }) => `nav-link toolbar-main ${isActive ? 'active' : ''}`}>
          <IconTools size={17} /> Merkora Tools
        </NavLink>
        <button
          type="button"
          className="toolbar-toggle"
          aria-label={expanded ? 'Toolbar zuklappen' : 'Toolbar aufklappen'}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <IconChevronDown size={14} /> : <IconChevron size={14} />}
        </button>
      </div>
      {expanded && (
        <div className="toolbar-items" role="menu" aria-label="Merkora Toolbar">
          <button
            type="button"
            className={`toolbar-btn ${wins.pomodoro.open ? 'active' : ''} ${p.running ? 'running' : ''}`}
            onClick={() => (toolWindows.toggle('pomodoro'), onNavigate())}
            title="Pomodoro-Timer als Popup öffnen"
          >
            <IconTimer size={15} />
            <span>Pomodoro-Timer</span>
            {pomoClock && <span className="pill-count pomo-pill">{pomoClock}</span>}
          </button>
          <button
            type="button"
            className={`toolbar-btn ${wins.todos.open ? 'active' : ''}`}
            onClick={() => (toolWindows.toggle('todos'), onNavigate())}
            title="To-do-Liste als Popup öffnen"
          >
            <IconChecklist size={15} />
            <span>To-do-Liste</span>
            {openTodos > 0 && <span className="pill-count soft">{openTodos}</span>}
          </button>
          <Link
            to="/tools?tab=plan"
            onClick={onNavigate}
            className={`toolbar-btn ${pathname === '/tools' ? 'soft-on' : ''}`}
            title="Arbeitsplanung starten"
          >
            <IconSparkle size={15} />
            <span>Arbeitsplanung</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function Tree({ onNavigate }: { onNavigate: () => void }) {
  const data = useStore((s) => s.data);
  const { pathname } = useLocation();
  // courses start collapsed (only the one you are in is open); workspaces and folders start open
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const toggleOpen = (id: string) => setOpen((c) => ({ ...c, [id]: !c[id] }));
  const toggle = (id: string) => setClosed((c) => ({ ...c, [id]: !c[id] }));
  return (
    <div className="tree">
      {data.workspaces.map((w) => (
        <div key={w.id} className="tree-ws">
          <button type="button" className="tree-head" onClick={() => toggle(w.id)}>
            <IconLibrary size={16} />
            <span>{w.name}</span>
            {closed[w.id] ? <IconChevron size={13} /> : <IconChevronDown size={13} />}
          </button>
          {!closed[w.id] &&
            data.courses
              .filter((c) => c.workspaceId === w.id)
              .map((c) => {
                const decks = data.decks.filter((d) => d.courseId === c.id);
                const names = shortNames(decks);
                const folders = c.folders ?? [];
                const courseUrl = `/library/${w.slug}/${c.slug}`;
                const inCourse = pathname === courseUrl || pathname.startsWith(courseUrl + '/');
                const expanded = open[c.id] ?? inCourse;
                const dueTotal = decks.reduce((n, d) => n + dueCards(d).length, 0);
                const deckLink = (d: Deck) => {
                  const url = deckUrl(data, d);
                  const due = dueCards(d).length;
                  return (
                    <Link key={d.id} to={url} onClick={onNavigate} className={`tree-link deck ${pathname === url ? 'active' : ''}`} title={d.name}>
                      <span className="tree-name">{names.get(d.id)}</span>
                      {due > 0 && <span className="pill-count">{due}</span>}
                    </Link>
                  );
                };
                return (
                  <div key={c.id} className="tree-course">
                    <div className="tree-course-row">
                      <button
                        type="button"
                        className="tree-toggle"
                        aria-label={expanded ? `${c.name} zuklappen` : `${c.name} aufklappen`}
                        aria-expanded={expanded}
                        onClick={() => setOpen((o) => ({ ...o, [c.id]: !expanded }))}
                      >
                        {expanded ? <IconChevronDown size={13} /> : <IconChevron size={13} />}
                      </button>
                      <NavLink to={courseUrl} end onClick={onNavigate} className={({ isActive }) => `tree-link course ${isActive ? 'active' : ''}`} title={c.name}>
                        <IconFolder size={15} />
                        <span className="tree-name">{c.name}</span>
                        {!expanded && dueTotal > 0 && <span className="pill-count soft">{dueTotal}</span>}
                      </NavLink>
                    </div>
                    {expanded && (
                      <div className="tree-decks">
                        {folders.map((fo) => {
                          const inside = decks.filter((d) => d.folderId === fo.id);
                          return (
                            <div key={fo.id} className="tree-folder">
                              <button type="button" className="tree-link folder" onClick={() => toggleOpen(fo.id + ':closed')}>
                                {open[fo.id + ':closed'] ? <IconChevron size={12} /> : <IconChevronDown size={12} />}
                                <span className="tree-name">{fo.name}</span>
                              </button>
                              {!open[fo.id + ':closed'] && inside.map(deckLink)}
                            </div>
                          );
                        })}
                        {decks.filter((d) => !d.folderId || !folders.some((fo) => fo.id === d.folderId)).map(deckLink)}
                      </div>
                    )}
                  </div>
                );
              })}
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
  const [newDeck, setNewDeck] = useState(false);
  const [aiCourse, setAiCourse] = useState<string | null>(null);
  // Strg+K / ⌘K or "/" (outside text fields): search everything
  const [search, setSearch] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
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
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Hauptnavigation">
        <div className="sidebar-top">
          <Logo className="small" />
          <button type="button" className="icon-btn mobile-only" aria-label="Menü schließen" onClick={close}>
            <IconClose />
          </button>
        </div>
        <button type="button" className="new-deck-btn" onClick={() => setNewDeck(true)}>
          <span className="plus">
            <IconPlus size={16} />
          </span>
          Neues Deck
        </button>
        <button type="button" className="search-btn" onClick={() => setSearch(true)} title="Karten, Decks und Kurse durchsuchen">
          <IconSearch size={16} />
          <span>Suchen …</span>
          <kbd>Strg K</kbd>
        </button>
        <div className="nav-main">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconHome /> Start
          </NavLink>
          <NavLink to="/library" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconLibrary /> Bibliothek
          </NavLink>
          <NavLink to="/skills" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconPractice /> Skills
          </NavLink>
          <NavLink to="/calendar" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconCalendar /> Prüfungen
          </NavLink>
          <NavLink to="/stats" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconChart /> Statistik
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconSettings /> Einstellungen
          </NavLink>
        </div>
        <SidebarToolbar onNavigate={close} />
        <div className="nav-section">Meine Kurse</div>
        <Tree onNavigate={close} />
        <JobsIndicator />
        {!isDesktop && <InstallButton />}
        <SaveState />
        <Link to="/settings#ki" className={`ai-status ${connected ? 'ok' : ''}`}>
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
      {phone && <PhoneNav onSearch={() => setSearch(true)} onNewDeck={() => setNewDeck(true)} />}
      <ToolWindows />
      <main className="app-main">
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
