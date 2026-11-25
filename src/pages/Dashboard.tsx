import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GoalRing } from '../components/GoalRing';
import { HeroScene } from '../components/HeroScene';
import { DeckCoverOf } from '../components/DeckCover';
import { Plant } from '../components/Plant';
import { GREETING, timeOfDay } from '../lib/look';
import { Link, useNavigate } from 'react-router-dom';
import { AnkiImport } from '../components/AnkiImport';
import { CreateWithAI } from '../components/CreateWithAI';
import { ExamDialog } from '../components/ExamDialog';
import {
  IconCalendar,
  IconCards,
  IconChevron,
  IconChecklist,
  IconFlame,
  IconPlay,
  IconPlus,
  IconPractice,
  IconSearch,
  IconSparkle,
  IconStar,
  IconTarget,
  IconUpload,
} from '../components/Icons';
import { nextLesson, skillProgress, skillStreak, skillToday } from '../lib/skills';
import { FoldPanel } from '../components/FoldPanel';
import { Mascot } from '../components/Mascot';
import { usePhone } from '../lib/phone';
import { pokeMove, type PokeMove } from '../lib/pipLines';
import { NoKeyHint } from '../components/NoKey';
import { countdownText, dailyPlan, examAt, examCards, examForecast, forecastText, readiness, upcomingExams } from '../lib/exams';
import { pathProgress, playerLevel, totalXp, xpStreak, xpToday } from '../lib/path';
import { masteryPercent, sortDecks, streak, type DeckSort } from '../lib/stats';
import { deckUrl, dueCards, newCardsLeft, setSettings, useStore, type Deck } from '../lib/store';
import { dueAcross } from '../lib/sessions';
import { estimateStudyMinutes, formatEstMinutes } from '../lib/deckTools';
import { StudySession, type SessionItem } from '../components/StudySession';
import { dayKey } from '../lib/util';
import { shortName } from '../lib/deckNames';
import { WeekReview } from '../components/WeekReview';
import { HomeTodos } from '../components/HomeTodos';
import { PomodoroTool } from '../components/tools/PomodoroTool';

type Tab = 'tasks' | 'decks' | 'quick';
const DECK_SORTS: { id: DeckSort; label: string }[] = [
  { id: 'due', label: 'Fällig zuerst' },
  { id: 'studied', label: 'Zuletzt gelernt' },
  { id: 'created', label: 'Zuletzt erstellt' },
];

/** Streak, today's XP and level as one quiet line under the greeting (goals are set in the settings). */
function HeroStats({ serie }: { serie: number }) {
  const data = useStore((s) => s.data);
  const today = xpToday(data);
  const goal = data.game.dailyGoal;
  const lvl = playerLevel(totalXp(data));
  return (
    <p className="hero-stats">
      <span className={today > 0 ? 'lit' : ''} title="Tage in Folge gelernt">
        <IconFlame size={14} /> {serie} {serie === 1 ? 'Tag' : 'Tage'} Serie
      </span>
      <span title="XP heute – Ziel ändern unter Einstellungen › Lernen">
        <IconTarget size={14} /> {Math.min(today, goal)} / {goal} XP heute
        <i className="hero-stats-bar">
          <i style={{ width: `${Math.min(100, (today / Math.max(1, goal)) * 100)}%` }} />
        </i>
      </span>
      <span title={`${lvl.into} von ${lvl.need} XP bis Stufe ${lvl.level + 1}`}>
        <IconStar size={14} /> Stufe {lvl.level}
      </span>
    </p>
  );
}

function DeckRow({ deck }: { deck: Deck }) {
  const data = useStore((s) => s.data);
  const c = data.courses.find((x) => x.id === deck.courseId);
  const name = shortName(deck, data.decks.filter((x) => x.courseId === deck.courseId));
  const pct = masteryPercent(deck.cards);
  const n = dueCards(deck).length;
  return (
    <Link to={document.documentElement.classList.contains('phone') ? deckUrl(data, deck) : deckUrl(data, deck, n ? 'learn' : 'cards')} className="deck-row">
      <DeckCoverOf deck={deck} size={40} />
      <span className="deck-info">
        <b title={deck.name}>{name}</b>
        <small>
          {c?.name} · {deck.cards.length} Karten
        </small>
      </span>
      <span className="deck-progress">
        <span className="bar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <small>{pct}%</small>
      </span>
      <Plant pct={pct} size={30} />
      {n > 0 ? <span className="pill-count">{n} fällig</span> : <span className="pill-ok">erledigt</span>}
    </Link>
  );
}

export default function Dashboard() {
  const data = useStore((s) => s.data);
  const apiKey = useStore((s) => s.apiKey);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('tasks');
  // phone: only the essentials (due decks, to-dos, next exam) – no tabs, side column or weekly review
  const phone = usePhone();
  const shownTab: Tab = phone ? 'tasks' : tab;
  const [create, setCreate] = useState<{ notes?: string; file?: File } | null>(null);
  const [anki, setAnki] = useState(false);
  const [exam, setExam] = useState(false);
  const [session, setSession] = useState<{ title: string; items: SessionItem[] } | null>(null);
  useEffect(() => {
    document.title = 'Start – Merkora';
  }, []);
  // Pip on the banner reacts to taps with a short move, then he is calm again
  const [poke, setPoke] = useState<{ n: number; move: PokeMove; active: boolean } | null>(null);
  const pokeTimer = useRef<number>();
  useEffect(() => () => clearTimeout(pokeTimer.current), []);
  const [deckQuery, setDeckQuery] = useState('');

  const now = Date.now();
  const today = dayKey(now);
  const activeDecks = useMemo(() => data.decks.filter((d) => !d.archived), [data.decks]);
  const due = activeDecks.reduce((a, d) => a + dueCards(d).length, 0);
  const estDueMin = estimateStudyMinutes(due, data.reviews);
  const cardsToday = new Set(data.reviews.filter((r) => dayKey(r.at) === today).map((r) => r.cardId)).size;
  const minutesToday = Math.round(data.game.minutesByDay?.[today] ?? 0);
  const hour = new Date().getHours();
  const tod = timeOfDay(hour);
  const hello = GREETING[tod];
  const goalReached = xpToday(data) >= data.game.dailyGoal;
  const serie = Math.max(xpStreak(data), streak(data.reviews));
  const exams = upcomingExams(data);
  const dueDecks = activeDecks.filter((d) => dueCards(d).length > 0).sort((a, b) => dueCards(b).length - dueCards(a).length);
  // the skill used last (active ones only)
  const lastSkill = [...(data.skills ?? [])].filter((s) => s.status === 'active').sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const skillNext = lastSkill ? { skill: lastSkill, lesson: nextLesson(lastSkill)?.lesson.title, prog: skillProgress(lastSkill) } : null;
  // to-dos of today (and overdue ones) for the line on the start page
  const todayKey = dayKey(Date.now());
  const todosToday = (data.todos ?? []).filter((t) => !t.doneAt && t.due && t.due <= todayKey);
  const cardGoal = data.settings.cardGoal ?? 50;
  const minuteGoal = data.settings.minuteGoal ?? 60;
  const deckSort = data.settings.homeDeckSort ?? 'due';
  const pokePip = () => {
    const n = (poke?.n ?? -1) + 1;
    const move = pokeMove(n);
    clearTimeout(pokeTimer.current);
    setPoke({ n, move, active: true });
    pokeTimer.current = window.setTimeout(() => setPoke((p) => (p && p.n === n ? { ...p, active: false } : p)), move === 'flip' ? 1000 : 1700);
  };
  const restMood = goalReached ? 'cheer' : tod === 'night' ? 'idle' : serie > 0 ? 'happy' : 'wave';
  const pathDeck = activeDecks
    .filter((d) => d.cards.length)
    .map((d) => ({ deck: d, p: pathProgress(d) }))
    .sort((a, b) => Math.max(0, ...Object.values(b.deck.path ?? {}).map((r) => r.at)) - Math.max(0, ...Object.values(a.deck.path ?? {}).map((r) => r.at)))
    .find((x) => x.p.done < x.p.total);

  const startAllDue = () => {
    const items = dueAcross(activeDecks, (d) => newCardsLeft(d));
    if (items.length) setSession({ title: 'Alle fälligen Karten heute', items });
  };

  if (session) {
    return (
      <div className="page">
        <StudySession title={session.title} items={session.items} onExit={() => setSession(null)} />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'tasks', label: 'Aufgaben', icon: <IconCalendar size={16} /> },
    { id: 'decks', label: 'Meine Decks', icon: <IconCards size={16} /> },
    { id: 'quick', label: 'Schnell erstellen', icon: <IconSparkle size={16} /> },
  ];

  return (
    <div className="home">
      <div className="home-main">
        <section className={`hero-banner tod-${tod}`}>
          <HeroScene tod={tod} />
          <button type="button" className={`hero-pip ${poke?.active && poke.move === 'flip' ? 'poke-flip' : ''}`} aria-label="Pip" title="Pip anstupsen" onClick={pokePip}>
            <Mascot
              who="pip"
              mood={poke?.active ? (poke.move === 'flip' ? 'happy' : poke.move) : restMood}
              pulse={poke ? `${poke.n}${poke.active ? 'a' : 'r'}` : undefined}
              size={104}
              className="hero-mascot"
            />
          </button>
          <div>
            <h1>
              {hello}
              {tod === 'night' ? '' : '!'}
            </h1>
            <p>
              {goalReached
                ? 'Tagesziel geschafft – Pip ist stolz auf dich!'
                : due > 0
                  ? `Heute ${due === 1 ? 'ist 1 Karte' : `sind ${due} Karten`} fällig${estDueMin ? ` (${formatEstMinutes(estDueMin)})` : ''}. Bereit, wenn du es bist.`
                  : 'Alles wiederholt. Bereit, wenn du es bist.'}
            </p>
            <HeroStats serie={serie} />
            {due > 0 && (
              <div className="hero-cta-row">
                <button type="button" className="btn hero-btn sm" onClick={startAllDue}>
                  <IconPlay size={13} /> Alle fälligen lernen ({due})
                </button>
              </div>
            )}
          </div>
          <button type="button" className="hero-ring" title={dueDecks[0] ? 'Jetzt lernen' : 'Statistik ansehen'} onClick={() => (due > 0 ? startAllDue() : navigate('/stats'))}>
            <GoalRing cards={cardsToday} cardGoal={cardGoal} minutes={minutesToday} minuteGoal={minuteGoal} hero />
          </button>
        </section>

        {!phone && (
          <button
            type="button"
            className="home-search"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
          >
            <IconSearch size={16} /> <span>Karten, Decks, Skills und Werkzeuge suchen …</span> <kbd>Strg K</kbd>
          </button>
        )}

        {!apiKey && data.settings.provider !== 'custom' && !data.settings.noKeyHintClosed && <NoKeyHint />}

        {!phone && <WeekReview />}

        {!phone && (
          <div className="home-tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`home-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        )}

        {shownTab === 'tasks' && (
          <div className="home-panel">
            <div className="home-tiles">
              {pathDeck && (
                <Link to={deckUrl(data, pathDeck.deck, 'path') + '&play=1'} className="home-tile t-path" title={`Lernpfad: ${pathDeck.deck.name}`}>
                  <span className="home-tile-icon">
                    <IconStar size={18} />
                  </span>
                  <b>Lernpfad</b>
                  <span className="home-tile-text">{pathDeck.deck.name}</span>
                  <small>
                    {pathDeck.p.done}/{pathDeck.p.total} Stationen · {pathDeck.p.stars} ★
                  </small>
                </Link>
              )}
              {phone && (
                <Link to="/tools?tab=todos" className="home-tile t-todo">
                  <span className="home-tile-icon">
                    <IconChecklist size={18} />
                  </span>
                  <b>To-dos</b>
                  <span className="home-tile-text">{todosToday.length ? todosToday.slice(0, 2).map((t) => t.text).join(' · ') : 'Nichts fällig'}</span>
                  <small>{todosToday.length ? `${todosToday.length} für heute` : 'Nächste Schritte planen'}</small>
                </Link>
              )}
              {skillNext && (
                <Link to={`/skills/${skillNext.skill.id}`} className="home-tile t-skill" title={skillNext.lesson ? `Lektion: ${skillNext.lesson}` : 'Stufentest wartet'}>
                  <span className="home-tile-icon">
                    <IconPractice size={18} />
                  </span>
                  <b>Weiterüben</b>
                  <span className="home-tile-text">{skillNext.skill.title}</span>
                  <span className="bar mini" aria-hidden="true" style={{ width: '100%', margin: '2px 0' }}>
                    <i style={{ width: `${Math.round(skillNext.prog.share * 100)}%` }} />
                  </span>
                  <small>
                    {skillNext.prog.done}/{skillNext.prog.total} Lektionen · heute {skillToday(skillNext.skill).done}/{skillToday(skillNext.skill).goal}
                    {skillStreak(skillNext.skill) > 0 && ` · Serie ${skillStreak(skillNext.skill)}`}
                  </small>
                </Link>
              )}
              {exams[0] ? (
                (() => {
                  const e = exams[0];
                  const r = readiness(data, e);
                  const p = dailyPlan(data, e);
                  const f = examForecast(examCards(data, e), data.reviews, examAt(e));
                  return (
                    <Link to="/tools?tab=exams" className="home-tile t-exam" title={r.total && (f.kind === 'ok' || f.kind === 'late') ? forecastText(f) : e.title}>
                      <span className="home-tile-icon">
                        <IconCalendar size={18} />
                      </span>
                      <b>Prüfung · {countdownText(e)}</b>
                      <span className="home-tile-text">{e.title}</span>
                      <small>
                        {r.total > 0 && (f.kind === 'ok' || f.kind === 'late') && <i className={'tile-dot ' + f.kind} />}
                        {r.total ? (p.left ? `heute ${p.left} ${p.left === 1 ? 'Karte' : 'Karten'}` : 'Tagesziel erreicht') : 'keine Decks'}
                        {exams.length > 1 ? ` · +${exams.length - 1} weitere` : ''}
                      </small>
                    </Link>
                  );
                })()
              ) : (
                <button type="button" className="home-tile t-exam" onClick={() => setExam(true)}>
                  <span className="home-tile-icon">
                    <IconPlus size={18} />
                  </span>
                  <b>Prüfung</b>
                  <span className="home-tile-text">Prüfung eintragen</span>
                  <small>Merkora plant bis zum Termin</small>
                </button>
              )}
            </div>
            {!phone && (
              <div className="home-widgets">
                <section className="home-widget">
                  <div className="home-widget-head">
                    <h2>Fokus</h2>
                    <Link to="/tools?tab=pomodoro" className="small-link">
                      Großer Timer <IconChevron size={12} />
                    </Link>
                  </div>
                  <PomodoroTool compact skip={false} />
                </section>
                <section className="home-widget">
                  <div className="home-widget-head">
                    <h2>To-dos</h2>
                  </div>
                  <HomeTodos />
                </section>
              </div>
            )}
            {phone && dueDecks.length > 0 && (
              <FoldPanel
                className="home-due"
                title="Heute fällig"
                summary={`${dueDecks.length} ${dueDecks.length === 1 ? 'Deck' : 'Decks'} · ${due} Karten`}
                collapsed={!!data.settings.homeDueCollapsed}
                onToggle={() => setSettings({ homeDueCollapsed: !data.settings.homeDueCollapsed })}
              >
                <div className="deck-list">
                  {dueDecks.slice(0, 6).map((d) => (
                    <DeckRow key={d.id} deck={d} />
                  ))}
                </div>
              </FoldPanel>
            )}
          </div>
        )}

        {shownTab === 'decks' && (
          <div className="home-panel">
            {activeDecks.length ? (
              <>
                {dueDecks.length > 0 && (
                  <div className="deck-due-line">
                    <span>
                      <b>{due}</b> {due === 1 ? 'Karte' : 'Karten'} in {dueDecks.length} {dueDecks.length === 1 ? 'Deck' : 'Decks'} fällig
                      {estDueMin > 0 && <small className="muted"> ({formatEstMinutes(estDueMin)})</small>}
                    </span>
                    <button type="button" className="btn primary sm" onClick={startAllDue}>
                      <IconPlay size={12} /> Alle fälligen lernen
                    </button>
                  </div>
                )}
                <div className="deck-tools">
                  <div className="seg compact" role="radiogroup" aria-label="Sortierung">
                    {DECK_SORTS.map((o) => (
                      <button key={o.id} type="button" role="radio" aria-checked={deckSort === o.id} className={deckSort === o.id ? 'on' : ''} onClick={() => setSettings({ homeDeckSort: o.id === 'due' ? undefined : o.id })}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {activeDecks.length > 8 && (
                    <input className="input deck-search" placeholder="Deck suchen …" aria-label="Deck suchen" value={deckQuery} onChange={(e) => setDeckQuery(e.target.value)} />
                  )}
                </div>
                <div className="deck-list">
                  {sortDecks(
                    activeDecks.filter((d) => !deckQuery.trim() || d.name.toLowerCase().includes(deckQuery.trim().toLowerCase())),
                    deckSort,
                    data.reviews,
                    (d) => dueCards(d).length,
                  ).map((d) => (
                    <DeckRow key={d.id} deck={d} />
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">Noch keine aktiven Decks.</p>
            )}
            <Link to="/library" className="small-link">
              Zur Bibliothek <IconChevron size={12} />
            </Link>
          </div>
        )}

        {shownTab === 'quick' && (
          <div className="home-panel quick-grid">
            <button type="button" className="quick-card" onClick={() => setCreate({})}>
              <IconSparkle size={22} />
              <b>Mit KI aus PDF, Word oder PowerPoint</b>
              <small>Karten, Zusammenfassung und Quiz</small>
            </button>
            <button type="button" className="quick-card" onClick={() => setAnki(true)}>
              <IconUpload size={22} />
              <b>Anki-Stapel übernehmen</b>
              <small>.apkg mit Bildern und Lernstand</small>
            </button>
            <button type="button" className="quick-card" onClick={() => navigate('/library')}>
              <IconPlus size={22} />
              <b>Leeres Deck</b>
              <small>Karten selbst schreiben</small>
            </button>
          </div>
        )}
      </div>

      {create && <CreateWithAI initialNotes={create.notes} initialFile={create.file} onClose={() => setCreate(null)} />}
      {anki && <AnkiImport onClose={() => setAnki(false)} />}
      {exam && <ExamDialog onClose={() => setExam(false)} />}
    </div>
  );
}
