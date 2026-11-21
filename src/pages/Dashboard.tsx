import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Aquarium } from '../components/Aquarium';
import { GoalRing } from '../components/GoalRing';
import { HeroScene } from '../components/HeroScene';
import { DeckCoverOf } from '../components/DeckCover';
import { Plant } from '../components/Plant';
import { GREETING, timeOfDay } from '../lib/look';
import { Link, useNavigate } from 'react-router-dom';
import { AnkiImport } from '../components/AnkiImport';
import { CreateWithAI } from '../components/CreateWithAI';
import { ExamDialog } from '../components/ExamDialog';
import { IconCalendar, IconCards, IconChevron, IconFlame, IconPlay, IconPlus, IconSparkle, IconStar, IconTarget, IconSearch, IconUpload, IconPractice, IconChecklist } from '../components/Icons';
import { nextLesson } from '../lib/skills';
import { FoldPanel } from '../components/FoldPanel';
import { Mascot } from '../components/Mascot';
import { usePhone } from '../lib/phone';
import { pokeMove, type PokeMove } from '../lib/pipLines';
import { NoKeyHint } from '../components/NoKey';
import { countdownText, dailyPlan, examAt, examCards, examDecks, examForecast, forecastShort, forecastText, readiness, upcomingExams } from '../lib/exams';
import { pathProgress, playerLevel, totalXp, xpStreak, xpToday } from '../lib/path';
import { masteryPercent, sortDecks, streak, studyDays, type DeckSort } from '../lib/stats';
import { deckUrl, dueCards, setSettings, useStore, type Deck } from '../lib/store';
import { dayKey } from '../lib/util';
import { shortName } from '../lib/deckNames';
import { WeekReview } from '../components/WeekReview';

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

/** Progress ring for the widgets on the right. */
function Ring({ value, goal, color, children }: { value: number; goal: number; color: string; children: ReactNode }) {
  const pct = Math.min(1, value / Math.max(1, goal));
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <span className="ring" style={{ ['--ring' as string]: color }}>
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="ring-icon">{children}</span>
    </span>
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
  const due = data.decks.reduce((a, d) => a + dueCards(d).length, 0);
  const cardsToday = new Set(data.reviews.filter((r) => dayKey(r.at) === today).map((r) => r.cardId)).size;
  const minutesToday = Math.round(data.game.minutesByDay?.[today] ?? 0);
  const hour = new Date().getHours();
  const tod = timeOfDay(hour);
  const hello = GREETING[tod];
  const goalReached = xpToday(data) >= data.game.dailyGoal;
  const serie = Math.max(xpStreak(data), streak(data.reviews));
  const exams = upcomingExams(data);
  const dueDecks = data.decks.filter((d) => dueCards(d).length > 0).sort((a, b) => dueCards(b).length - dueCards(a).length);
  // the skill used last (active ones only)
  const lastSkill = [...(data.skills ?? [])].filter((s) => s.status === 'active').sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const skillNext = lastSkill ? { skill: lastSkill, lesson: nextLesson(lastSkill)?.lesson.title } : null;
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
  const pathDeck = data.decks
    .filter((d) => d.cards.length)
    .map((d) => ({ deck: d, p: pathProgress(d) }))
    .sort((a, b) => Math.max(0, ...Object.values(b.deck.path ?? {}).map((r) => r.at)) - Math.max(0, ...Object.values(a.deck.path ?? {}).map((r) => r.at)))
    .find((x) => x.p.done < x.p.total);


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
                  ? `Heute ${due === 1 ? 'ist 1 Karte' : `sind ${due} Karten`} fällig. Bereit, wenn du es bist.`
                  : 'Alles wiederholt. Bereit, wenn du es bist.'}
            </p>
            <HeroStats serie={serie} />
          </div>
          {dueDecks[0] && (
            <Link to={deckUrl(data, dueDecks[0], 'learn')} className="btn hero-btn">
              <IconPlay size={13} /> Jetzt lernen
            </Link>
          )}
        </section>
        {phone && <GoalRing cards={cardsToday} cardGoal={cardGoal} minutes={minutesToday} minuteGoal={minuteGoal} compact />}


        {!phone && (
          <button
            type="button"
            className="home-search"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
          >
            <IconSearch size={16} /> <span>Karten, Decks und Dateien suchen …</span> <kbd>Strg K</kbd>
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
            {pathDeck && !phone && (
              <Link to={deckUrl(data, pathDeck.deck, 'path') + '&play=1'} className="path-cta">
                <span className="path-cta-icon">
                  <IconStar size={24} />
                </span>
                <span className="grow">
                  <b>Lernpfad: {pathDeck.deck.name}</b>
                  <small>
                    {pathDeck.p.done} von {pathDeck.p.total} Stationen · {pathDeck.p.stars} Sterne gesammelt
                  </small>
                </span>
                <span className="btn outline sm">{pathDeck.p.done ? 'Weiterspielen' : 'Starten'}</span>
              </Link>
            )}
            <Link to="/tools?tab=todos" className="path-cta todo-cta">
              <span className="path-cta-icon">
                <IconChecklist size={22} />
              </span>
              <span className="grow">
                <b>To-dos{todosToday.length ? `: ${todosToday.length} für heute` : ''}</b>
                <small>{todosToday.length ? todosToday.slice(0, 3).map((t) => t.text).join(' · ') : 'Nichts fällig – plane deine nächsten Schritte'}</small>
              </span>
              <span className="btn outline sm">Öffnen</span>
            </Link>
            {skillNext && (
              <Link to={`/skills/${skillNext.skill.id}`} className="path-cta skill-cta">
                <span className="path-cta-icon">
                  <IconPractice size={22} />
                </span>
                <span className="grow">
                  <b>Weiterüben: {skillNext.skill.title}</b>
                  <small>
                    {skillNext.lesson ? `Lektion: ${skillNext.lesson}` : 'Alle Lektionen geschafft – Stufentest wartet'}
                  </small>
                </span>
                <span className="btn outline sm">Üben</span>
              </Link>
            )}
            {phone && exams[0] && (
              <Link to="/tools?tab=exams" className="phone-exam">
                <IconCalendar size={16} />
                <span className="grow">
                  <b>{exams[0].title}</b>
                  <small>
                    {countdownText(exams[0])}
                    {exams.length > 1 ? ` · +${exams.length - 1} weitere` : ''}
                  </small>
                </span>
                <IconChevron size={14} />
              </Link>
            )}
            {exams.length > 0 && !phone && (
              <section className="panel">
                <div className="panel-head">
                  <h2>Anstehende Prüfungen</h2>
                  <span className="row-gap">
                    <button type="button" className="btn ghost sm" onClick={() => setExam(true)}>
                      <IconPlus size={14} /> Prüfung eintragen
                    </button>
                    <Link to="/tools?tab=exams" className="small-link">
                      Alle Prüfungen
                    </Link>
                  </span>
                </div>
                {exams.slice(0, 4).map((e) => {
                  const r = readiness(data, e);
                  const p = dailyPlan(data, e);
                  const f = examForecast(examCards(data, e), data.reviews, examAt(e));
                  return (
                    <div key={e.id} className="dash-exam-row">
                      <Link to="/tools?tab=exams" className="dash-exam">
                        <b>{e.title}</b>
                        <span className="pill-count">{countdownText(e)}</span>
                        <span className="bar">
                          <i style={{ width: `${r.percent}%` }} />
                        </span>
                        <small>{r.total ? (p.left ? `heute ${p.left} Karten` : 'Tagesziel erreicht') : 'keine Decks'}</small>
                      </Link>
                      <div className="dash-exam-more">
                        {r.total > 0 && (f.kind === 'ok' || f.kind === 'late') && (
                          <span className={'fc-note ' + f.kind} title={forecastText(f)}>
                            <i /> {forecastShort(f)}
                          </span>
                        )}
                        {examDecks(data, e)[0] && (
                          <Link to={deckUrl(data, examDecks(data, e)[0], 'exam')} className="small-link dash-exam-practice" title="Probeprüfung mit Note und Musterlösung">
                            <IconTarget size={13} /> Prüfung üben
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
            {!exams.length && dueDecks.length > 0 && !phone && (
              <button type="button" className="exam-cta" onClick={() => setExam(true)}>
                <IconCalendar size={18} />
                <span className="grow">
                  <b>Prüfung eintragen</b>
                  <small>Merkora plant deine Wiederholungen bis zum Termin</small>
                </span>
                <IconPlus size={16} />
              </button>
            )}
            {dueDecks.length > 0 && (
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
            {!exams.length && !dueDecks.length && (
              <div className="home-empty">
                <b>Keine anstehenden Aufgaben</b>
                <p className="muted">Alles erledigt – oder hast du vergessen, deine Prüfungstermine einzutragen?</p>
                <button type="button" className="btn primary" onClick={() => setExam(true)}>
                  <IconCalendar size={16} /> Prüfung eintragen
                </button>
              </div>
            )}
          </div>
        )}

        {shownTab === 'decks' && (
          <div className="home-panel">
            {data.decks.length ? (
              <>
                <div className="deck-tools">
                  <div className="seg compact" role="radiogroup" aria-label="Sortierung">
                    {DECK_SORTS.map((o) => (
                      <button key={o.id} type="button" role="radio" aria-checked={deckSort === o.id} className={deckSort === o.id ? 'on' : ''} onClick={() => setSettings({ homeDeckSort: o.id === 'due' ? undefined : o.id })}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {data.decks.length > 8 && (
                    <input className="input deck-search" placeholder="Deck suchen …" aria-label="Deck suchen" value={deckQuery} onChange={(e) => setDeckQuery(e.target.value)} />
                  )}
                </div>
                <div className="deck-list">
                  {sortDecks(
                    data.decks.filter((d) => !deckQuery.trim() || d.name.toLowerCase().includes(deckQuery.trim().toLowerCase())),
                    deckSort,
                    data.reviews,
                    (d) => dueCards(d).length,
                  ).map((d) => (
                    <DeckRow key={d.id} deck={d} />
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">Noch keine Decks.</p>
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

      {!phone && (
      <aside className="home-rail">
        <div className="widget goal-widget">
          <GoalRing cards={cardsToday} cardGoal={cardGoal} minutes={minutesToday} minuteGoal={minuteGoal} />
        </div>
        <Link to="/stats#aquarium" className="widget aquarium-widget" title="Dein Aquarium ansehen">
          <small>Dein Aquarium</small>
          <Aquarium compact />
        </Link>
        <MiniCalendar />
      </aside>
      )}

      {create && <CreateWithAI initialNotes={create.notes} initialFile={create.file} onClose={() => setCreate(null)} />}
      {anki && <AnkiImport onClose={() => setAnki(false)} />}
      {exam && <ExamDialog onClose={() => setExam(false)} />}
    </div>
  );
}

/** Small month calendar: exam days are filled, days you studied get a small orange dot. */
function MiniCalendar() {
  const data = useStore((s) => s.data);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const examDays = new Map(data.exams.map((e) => [e.date, e.title]));
  const studied = studyDays(data.reviews);
  const first = (month.getDay() + 6) % 7;
  const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = dayKey(Date.now());
  return (
    <div className="widget mini-cal">
      <div className="mini-cal-head">
        <button type="button" className="icon-btn flip" aria-label="Vorheriger Monat" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
          <IconChevron size={14} />
        </button>
        <button type="button" className="icon-btn" aria-label="Nächster Monat" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
          <IconChevron size={14} />
        </button>
        <b>{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</b>
        <span className="grow" />
        <Link to="/tools?tab=exams" className="small-link">
          Öffnen
        </Link>
      </div>
      <div className="mini-grid">
        {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((w, i) => (
          <span key={i} className="mwd">
            {w}
          </span>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={'e' + i} />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const k = dayKey(new Date(month.getFullYear(), month.getMonth(), i + 1).getTime());
          const ex = examDays.get(k);
          const learned = studied.get(k) ?? 0;
          const tip = [ex, learned ? `gelernt: ${learned} ${learned === 1 ? 'Karte' : 'Karten'}` : ''].filter(Boolean).join(' · ');
          return (
            <Link key={k} to="/tools?tab=exams" className={`mcal-day ${k === today ? 'today' : ''} ${ex ? 'exam' : ''} ${learned ? 'studied' : ''}`} title={tip}>
              {i + 1}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
