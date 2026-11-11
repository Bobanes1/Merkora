import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { aiReady, PROVIDERS } from '../lib/ai';
import { deckUrl, dueCards, isDesktop, useStore, type Deck } from '../lib/store';
import { SECOND_MODEL } from '../config';
import { CreateWithAI } from './CreateWithAI';
import { shortNames } from '../lib/deckNames';
import { NewDeckModal } from './NewDeck';
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
  IconFolder,
  IconPlus,
} from './Icons';
import { InstallButton } from './InstallButton';
import { JobsIndicator } from './Jobs';
import { Logo } from './Logo';
import { ErrorBoundary } from './ErrorBoundary';
import { UpdateNotice } from './UpdateNotice';
import { MasterySnapshots } from './WeekReview';
import { FocusBar, Pomodoro, setFocus } from './Pomodoro';

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
        <button type="button" className="new-deck-btn" onClick={() => setNewDeck(true)}>
          <span className="plus">
            <IconPlus size={16} />
          </span>
          Neues Deck
        </button>
        <div className="nav-main">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconHome /> Start
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
        {pathname !== '/dashboard' && <Pomodoro />}
        <JobsIndicator />
        {!isDesktop && <InstallButton />}
        <SaveState />
        <Link to="/settings" className={`ai-status ${connected ? 'ok' : ''}`}>
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
      <main className="app-main">
        <FocusBar />
        <UpdateNotice />
        <MasterySnapshots />
        <ErrorBoundary key={pathname} inline>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
