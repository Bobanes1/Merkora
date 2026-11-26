import { useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconCalendar,
  IconChart,
  IconChecklist,
  IconChevronDown,
  IconCode,
  IconGrid,
  IconHeadphones,
  IconHeart,
  IconImage,
  IconMindmap,
  IconMusic,
  IconNote,
  IconPopout,
  IconSearch,
  IconSidebar,
  IconSparkle,
  IconStar,
  IconStarLine,
  IconTarget,
  IconTimer,
} from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { Lab, LAB_DEFAULTS, LAB_TITLES } from '../components/labs/Labs';
import { BreathingTool } from '../components/tools/BreathingTool';
import { CalculatorTool } from '../components/tools/CalculatorTool';
import { CodePlaygroundTool } from '../components/tools/CodePlaygroundTool';
import { Models3DTool } from '../components/tools/Models3DTool';
import { PeriodicTableTool } from '../components/tools/PeriodicTableTool';
import { PianoTool } from '../components/tools/PianoTool';
import { PomodoroTool } from '../components/tools/PomodoroTool';
import { ScratchpadTool } from '../components/tools/ScratchpadTool';
import { SoundsTool } from '../components/tools/SoundsTool';
import { VisualLibraryTool } from '../components/tools/VisualLibraryTool';
import { WorkPlanner } from '../components/tools/WorkPlanner';
import { useAmbient } from '../lib/ambient';
import { usePhone } from '../lib/phone';
import { fmtClock, usePomodoro } from '../lib/pomodoro';
import { remaining } from '../lib/pomodoroRule';
import { setSettings, useStore } from '../lib/store';
import { toolWindows, type ToolWindowId } from '../lib/toolWindows';
import { DAY, dayKey } from '../lib/util';
import CalendarPage from './Calendar';
import Todos from './Todos';

type Tab =
  | 'todos'
  | 'plan'
  | 'exams'
  | 'pomodoro'
  | 'sounds'
  | 'notes'
  | 'breath'
  | 'visuals'
  | 'models3d'
  | 'code'
  | 'calc'
  | 'labs'
  | 'periodic'
  | 'piano';

type TabGroup = 'plan' | 'focus' | 'stem' | 'creative';

type TabDef = {
  id: Tab;
  group: TabGroup;
  label: string;
  keywords: string;
  popupId?: ToolWindowId;
  icon: (p: { size?: number }) => ReactElement;
};

const TABS: TabDef[] = [
  { id: 'todos', group: 'plan', label: 'To-do-Liste', keywords: 'aufgaben liste check', popupId: 'todos', icon: IconChecklist },
  { id: 'plan', group: 'plan', label: 'Arbeitsplanung', keywords: 'zeitplan woche plan', icon: IconSparkle },
  { id: 'exams', group: 'plan', label: 'Prüfungen', keywords: 'kalender klausur termin', icon: IconCalendar },
  { id: 'pomodoro', group: 'focus', label: 'Pomodoro-Timer', keywords: 'timer uhr fokus pause', popupId: 'pomodoro', icon: IconTimer },
  { id: 'sounds', group: 'focus', label: 'Klänge', keywords: 'musik regen lofi ambient audio', popupId: 'sounds', icon: IconHeadphones },
  { id: 'notes', group: 'focus', label: 'Notizblock', keywords: 'notizen schreiben skizze', popupId: 'notes', icon: IconNote },
  { id: 'breath', group: 'focus', label: 'Atem-Reset', keywords: 'entspannen pause atmen', icon: IconHeart },
  { id: 'code', group: 'stem', label: 'Code-Spielwiese', keywords: 'java python javascript sql programmieren', icon: IconCode },
  { id: 'calc', group: 'stem', label: 'Rechner', keywords: 'taschenrechner formel mathe', popupId: 'calc', icon: IconTarget },
  { id: 'labs', group: 'stem', label: 'Mathe-Labore', keywords: 'simulation graphen statistik funktionen', icon: IconChart },
  { id: 'periodic', group: 'stem', label: 'Periodensystem', keywords: 'chemie elemente pse', icon: IconGrid },
  { id: 'visuals', group: 'creative', label: 'Grafiken', keywords: 'diagramme bilder vorlagen', icon: IconImage },
  { id: 'models3d', group: 'creative', label: '3D-Modelle', keywords: 'dna herz molekül 3d anatomie', icon: IconMindmap },
  { id: 'piano', group: 'creative', label: 'Klavier', keywords: 'musik klaviatur akkorde tonleiter', icon: IconMusic },
];

const GROUPS: { id: TabGroup; label: string }[] = [
  { id: 'plan', label: 'Planen' },
  { id: 'focus', label: 'Fokus' },
  { id: 'stem', label: 'MINT & Code' },
  { id: 'creative', label: 'Visuell & Kreativ' },
];

/** Phone: grouped area picker sheet with live badges. */
function ToolPicker({ tab, setTab, badges }: { tab: Tab; setTab: (t: Tab) => void; badges: Partial<Record<Tab, string>> }) {
  const [open, setOpen] = useState(false);
  const cur = TABS.find((t) => t.id === tab)!;
  return (
    <>
      <button type="button" className={`tools-picker mode-${cur.id}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="tools-picker-icon">
          <cur.icon size={18} />
        </span>
        <span className="grow">
          <small>{GROUPS.find((g) => g.id === cur.group)?.label}</small>
          <b>{cur.label}</b>
        </span>
        {badges[cur.id] && <span className="tab-badge">{badges[cur.id]}</span>}
        <IconChevronDown size={18} />
      </button>
      {open && (
        <Sheet title="Merkora Tools" onClose={() => setOpen(false)}>
          <div className="sheet-list" role="listbox" aria-label="Bereich wählen">
            {GROUPS.map((g) => (
              <div key={g.id} className="sheet-group">
                <small className="muted sheet-group-label">{g.label}</small>
                {TABS.filter((t) => t.group === g.id).map((t) => (
                  <button key={t.id} type="button" role="option" aria-selected={t.id === tab} className={`mode-${t.id} ${t.id === tab ? 'on' : ''}`} onClick={() => (setTab(t.id), setOpen(false))}>
                    <t.icon size={19} /> <span className="grow">{t.label}</span>
                    {badges[t.id] && <span className="tab-badge">{badges[t.id]}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

/**
 * Merkora Tools: calm left-sidebar workspace for planning, focus & subject tools – all working offline.
 */
export default function Tools() {
  const [params, setParams] = useSearchParams();
  const rawParam = params.get('tab');
  // keep legacy ?tab=java working smoothly
  const mapped = rawParam === 'java' ? 'code' : rawParam;
  const tab: Tab = mapped && TABS.some((t) => t.id === mapped) ? (mapped as Tab) : 'todos';
  const setTab = (id: Tab) => setParams({ tab: id }, { replace: true });
  const phone = usePhone();
  const [query, setQuery] = useState('');

  const data = useStore((s) => s.data);
  const pomo = usePomodoro();
  const amb = useAmbient();

  const collapsed = !!data.settings.toolsSidebarCollapsed;
  const pinnedIds = (data.settings.pinnedTools ?? []).filter((id): id is Tab => TABS.some((t) => t.id === id));
  const pinnedSet = new Set<Tab>(pinnedIds);

  const togglePin = (id: Tab) => {
    const next = pinnedSet.has(id) ? pinnedIds.filter((x) => x !== id) : [...pinnedIds, id];
    setSettings({ pinnedTools: next });
  };
  const toggleCollapsed = () => setSettings({ toolsSidebarCollapsed: !collapsed });

  const now = Date.now();
  const today = dayKey(now);
  const openToday = (data.todos ?? []).filter((t) => !t.doneAt && t.due && t.due <= today).length;
  const openAll = (data.todos ?? []).filter((t) => !t.doneAt).length;
  const nextExamDays = (() => {
    const upcoming = (data.exams ?? [])
      .map((e) => Math.ceil((new Date(e.date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / DAY))
      .filter((d) => d >= 0)
      .sort((a, b) => a - b);
    return upcoming.length ? upcoming[0] : null;
  })();
  const soundCount = Object.keys(amb.playing).length;

  // Only live / actionable badges in the sidebar to keep navigation calm
  const badges: Partial<Record<Tab, string>> = {
    ...(openToday > 0 ? { todos: String(openToday) } : openAll > 0 ? { todos: String(openAll) } : {}),
    ...(pomo.running ? { pomodoro: fmtClock(remaining(pomo, now)) } : {}),
    ...(soundCount > 0 ? { sounds: amb.paused ? '⏸' : '●' } : {}),
    ...(nextExamDays !== null ? { exams: nextExamDays === 0 ? 'Heute' : `${nextExamDays} T` } : {}),
  };

  const q = query.trim().toLowerCase();
  const matches = (t: TabDef) => !q || t.label.toLowerCase().includes(q) || t.keywords.includes(q);
  const pinnedTabs = !q ? pinnedIds.map((id) => TABS.find((t) => t.id === id)!).filter(Boolean) : [];
  const curTab = TABS.find((t) => t.id === tab)!;

  const renderNavItem = (t: TabDef, keyPrefix: string) => {
    const active = tab === t.id;
    const pinned = pinnedSet.has(t.id);
    const badge = badges[t.id];
    return (
      <div key={`${keyPrefix}-${t.id}`} className={`tools-nav-row mode-${t.id}${active ? ' on' : ''}`}>
        <button
          type="button"
          role="tab"
          aria-selected={active}
          className="tools-nav-btn"
          title={collapsed ? t.label : undefined}
          onClick={() => setTab(t.id)}
        >
          <span className="tools-nav-ico" aria-hidden="true">
            <t.icon size={16} />
          </span>
          {!collapsed && <span className="tools-nav-label">{t.label}</span>}
          {!collapsed && badge && (
            <span className={`tab-badge${t.id === 'sounds' && !amb.paused ? ' live' : ''}`}>{badge}</span>
          )}
          {collapsed && badge && <span className={`tools-nav-dot${t.id === 'sounds' && !amb.paused ? ' live' : ''}`} aria-hidden="true" />}
        </button>
        {!collapsed && (
          <div className="tools-nav-actions">
            {t.popupId && (
              <button
                type="button"
                className="tools-nav-act"
                title={`${t.label} als schwebendes Popup öffnen`}
                aria-label={`${t.label} als Popup öffnen`}
                onClick={(e) => {
                  e.stopPropagation();
                  toolWindows.toggle(t.popupId!);
                }}
              >
                <IconPopout size={13} />
              </button>
            )}
            <button
              type="button"
              className={`tools-nav-act${pinned ? ' pinned' : ''}`}
              title={pinned ? 'Aus Favoriten lösen' : 'Oben anheften'}
              aria-label={pinned ? `${t.label} lösen` : `${t.label} anheften`}
              onClick={(e) => {
                e.stopPropagation();
                togglePin(t.id);
              }}
            >
              {pinned ? <IconStar size={13} /> : <IconStarLine size={13} />}
            </button>
          </div>
        )}
      </div>
    );
  };

  const content = (
    <div className="tools-content" key={tab}>
      {tab === 'todos' && <Todos embedded />}

      {tab === 'plan' && <WorkPlanner />}

      {tab === 'exams' && <CalendarPage embedded />}

      {tab === 'pomodoro' && (
        <section className="panel tools-pomo-panel">
          <div className="panel-head">
            <div>
              <h2>Pomodoro-Timer</h2>
              <p className="muted small">Abgeschlossene Lernrunden zählen automatisch zu deiner Lernzeit – jede 4. Runde startet eine lange Pause.</p>
            </div>
            <button type="button" className="btn outline sm" onClick={() => toolWindows.open('pomodoro')}>
              <IconPopout size={14} /> Als Popup öffnen
            </button>
          </div>
          <PomodoroTool />
        </section>
      )}

      {tab === 'sounds' && <SoundsTool />}

      {tab === 'notes' && (
        <section className="panel">
          <ScratchpadTool />
        </section>
      )}

      {tab === 'breath' && (
        <section className="panel">
          <BreathingTool />
        </section>
      )}

      {tab === 'visuals' && <VisualLibraryTool />}

      {tab === 'models3d' && <Models3DTool />}

      {tab === 'code' && <CodePlaygroundTool />}

      {tab === 'calc' && (
        <section className="panel">
          <CalculatorTool />
        </section>
      )}

      {tab === 'labs' && (
        <section className="panel">
          <h2>Mathe-Labore</h2>
          <p className="muted small">Interaktive Simulationen mit Schiebereglern &amp; Vergleichsfunktion – ohne KI.</p>
          <LabPicker />
        </section>
      )}

      {tab === 'periodic' && <PeriodicTableTool />}

      {tab === 'piano' && <PianoTool />}
    </div>
  );

  if (phone) {
    return (
      <div className="page tools-page" data-mode={tab}>
        <div className="page-head">
          <div>
            <h1>Merkora Tools</h1>
          </div>
        </div>
        <ToolPicker tab={tab} setTab={setTab} badges={badges} />
        {content}
      </div>
    );
  }

  return (
    <div className="page wide tools-page" data-mode={tab}>
      <div className={`tools-shell${collapsed ? ' collapsed' : ''}`}>
        <aside className="tools-sidebar" aria-label="Merkora Tools Navigation">
          <div className="tools-sidebar-head">
            {!collapsed && <span className="tools-sidebar-title">Tools</span>}
            <button
              type="button"
              className="icon-btn sm"
              title={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
              aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
              aria-expanded={!collapsed}
              onClick={toggleCollapsed}
            >
              <IconSidebar size={16} />
            </button>
          </div>

          {!collapsed && (
            <div className="tools-sidebar-search">
              <IconSearch size={13} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tool filtern …"
                aria-label="Tools filtern"
              />
              {query && (
                <button type="button" className="tools-search-clear" aria-label="Filter leeren" onClick={() => setQuery('')}>
                  ×
                </button>
              )}
            </div>
          )}

          <nav className="tools-nav" role="tablist" aria-orientation="vertical" aria-label="Tools-Bereiche">
            {pinnedTabs.length > 0 && (
              <div className="tools-nav-group">
                {!collapsed && <span className="tools-nav-group-label">Angeheftet</span>}
                {pinnedTabs.map((t) => renderNavItem(t, 'pin'))}
              </div>
            )}

            {GROUPS.map((g) => {
              const items = TABS.filter((t) => t.group === g.id && matches(t));
              if (!items.length) return null;
              return (
                <div key={g.id} className="tools-nav-group">
                  {!collapsed ? <span className="tools-nav-group-label">{g.label}</span> : <div className="tools-nav-sep" />}
                  {items.map((t) => renderNavItem(t, g.id))}
                </div>
              );
            })}

            {q && TABS.every((t) => !matches(t)) && !collapsed && (
              <p className="muted small tools-nav-empty">Kein Tool für „{query}“.</p>
            )}
          </nav>
        </aside>

        <div className="tools-main">
          {collapsed && curTab.popupId && (
            <div className="tools-main-bar">
              <span className="tools-main-bar-title">
                <curTab.icon size={15} /> {curTab.label}
              </span>
              <button type="button" className="btn ghost sm" onClick={() => toolWindows.toggle(curTab.popupId!)}>
                <IconPopout size={13} /> Als Popup öffnen
              </button>
            </div>
          )}
          {content}
        </div>
      </div>
    </div>
  );
}

function LabPicker() {
  const [i, setI] = useState(0);
  return (
    <div className="tool">
      <div className="chips">
        {LAB_DEFAULTS.map((l, k) => (
          <button key={l.type} type="button" className={'chip' + (k === i ? ' on' : '')} onClick={() => setI(k)}>
            {LAB_TITLES[l.type]}
          </button>
        ))}
      </div>
      <Lab key={i} spec={LAB_DEFAULTS[i]} />
    </div>
  );
}
