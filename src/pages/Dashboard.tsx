import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnkiImport } from '../components/AnkiImport';
import { CreateWithAI } from '../components/CreateWithAI';
import { ExamDialog } from '../components/ExamDialog';
import { IconCalendar, IconCards, IconChevron, IconFlame, IconPlay, IconPlus, IconSparkle, IconStar, IconUpload } from '../components/Icons';
import { Mascot } from '../components/Mascot';
import { NoKeyNotice } from '../components/NoKey';
import { Pomodoro } from '../components/Pomodoro';
import { countdownText, dailyPlan, examAt, readiness, upcomingExams } from '../lib/exams';
import { pathProgress, xpStreak, xpToday } from '../lib/path';
import { masteryPercent, streak } from '../lib/stats';
import { deckUrl, dueCards, useStore, type Deck } from '../lib/store';
import { DAY, dayKey, startOfDay } from '../lib/util';
import { shortName } from '../lib/deckNames';
import { WeekReview } from '../components/WeekReview';
import { GameBar } from './tabs/PathTab';

const CARD_GOAL = 50;
const MINUTE_GOAL = 60;
type Tab = 'tasks' | 'decks' | 'recent' | 'quick';

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
    <Link to={deckUrl(data, deck, n ? 'learn' : 'cards')} className="deck-row">
      <span className="deck-icon">
        <IconCards />
      </span>
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
      {n > 0 ? <span className="pill-count">{n} fällig</span> : <span className="pill-ok">erledigt</span>}
    </Link>
  );
}

export default function Dashboard() {
  const data = useStore((s) => s.data);
  const apiKey = useStore((s) => s.apiKey);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('tasks');
  const [create, setCreate] = useState<{ notes?: string; file?: File } | null>(null);
  const [anki, setAnki] = useState(false);
  const [exam, setExam] = useState(false);
  useEffect(() => {
    document.title = 'Start – Merkora';
  }, []);

  const now = Date.now();
  const today = dayKey(now);
  const due = data.decks.reduce((a, d) => a + dueCards(d).length, 0);
  const cardsToday = new Set(data.reviews.filter((r) => dayKey(r.at) === today).map((r) => r.cardId)).size;
  const minutesToday = Math.round(data.game.minutesByDay?.[today] ?? 0);
  const hour = new Date().getHours();
  const hello = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const goalReached = xpToday(data) >= data.game.dailyGoal;
  const serie = Math.max(xpStreak(data), streak(data.reviews));
  const exams = upcomingExams(data);
  const dueDecks = data.decks.filter((d) => dueCards(d).length > 0).sort((a, b) => dueCards(b).length - dueCards(a).length);
  const pathDeck = data.decks
    .filter((d) => d.cards.length)
    .map((d) => ({ deck: d, p: pathProgress(d) }))
    .sort((a, b) => Math.max(0, ...Object.values(b.deck.path ?? {}).map((r) => r.at)) - Math.max(0, ...Object.values(a.deck.path ?? {}).map((r) => r.at)))
    .find((x) => x.p.done < x.p.total);


  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'tasks', label: 'Aufgaben', icon: <IconCalendar size={16} /> },
    { id: 'decks', label: 'Karteikarten', icon: <IconCards size={16} /> },
    { id: 'recent', label: 'Zuletzt erstellt', icon: <IconStar size={16} /> },
    { id: 'quick', label: 'Schnell erstellen', icon: <IconSparkle size={16} /> },
  ];

  return (
    <div className="home">
      <div className="home-main">
        <section className="hero-banner">
          <Mascot who="pip" mood={goalReached ? 'cheer' : serie > 0 ? 'happy' : 'wave'} size={104} className="hero-mascot" />
          <div>
            <h1>{hello}!</h1>
            <p>
              {goalReached
                ? 'Tagesziel geschafft – Pip ist stolz auf dich!'
                : due > 0
                  ? `Heute ${due === 1 ? 'ist 1 Karte' : `sind ${due} Karten`} fällig. Bereit, wenn du es bist.`
                  : 'Alles wiederholt. Bereit, wenn du es bist.'}
            </p>
          </div>
          {dueDecks[0] && (
            <Link to={deckUrl(data, dueDecks[0], 'learn')} className="btn hero-btn">
              <IconPlay size={13} /> Jetzt lernen
            </Link>
          )}
        </section>


        {!apiKey && data.settings.provider !== 'custom' && <NoKeyNotice />}

        <WeekReview />

        <div className="home-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`home-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'tasks' && (
          <div className="home-panel">
            <GameBar />
            {pathDeck && (
              <Link to={deckUrl(data, pathDeck.deck, 'path')} className="path-cta">
                <span className="path-cta-icon">
                  <IconStar size={24} />
                </span>
                <span className="grow">
                  <b>Lernpfad: {pathDeck.deck.name}</b>
                  <small>
                    {pathDeck.p.done} von {pathDeck.p.total} Stationen · {pathDeck.p.stars} Sterne gesammelt
                  </small>
                </span>
                <span className="btn primary sm">{pathDeck.p.done ? 'Weiterspielen' : 'Starten'}</span>
              </Link>
            )}
            {exams.length > 0 && (
              <section className="panel">
                <div className="panel-head">
                  <h2>Anstehende Prüfungen</h2>
                  <Link to="/calendar" className="small-link">
                    Kalender
                  </Link>
                </div>
                {exams.slice(0, 4).map((e) => {
                  const r = readiness(data, e);
                  const p = dailyPlan(data, e);
                  return (
                    <Link key={e.id} to="/calendar" className="dash-exam">
                      <b>{e.title}</b>
                      <span className="pill-count">{countdownText(e)}</span>
                      <span className="bar">
                        <i style={{ width: `${r.percent}%` }} />
                      </span>
                      <small>{r.total ? (p.left ? `heute ${p.left} Karten` : 'Tagesziel erreicht') : 'keine Decks'}</small>
                    </Link>
                  );
                })}
              </section>
            )}
            {dueDecks.length > 0 && (
              <section className="panel">
                <h2>Heute fällig</h2>
                <div className="deck-list">
                  {dueDecks.slice(0, 6).map((d) => (
                    <DeckRow key={d.id} deck={d} />
                  ))}
                </div>
              </section>
            )}
            {!exams.length && !dueDecks.length && (
              <div className="home-empty">
                <Mascot who="pip" mood="think" size={120} />
                <b>Keine anstehenden Aufgaben</b>
                <p className="muted">Alles erledigt – oder hast du vergessen, deine Prüfungstermine einzutragen?</p>
                <button type="button" className="btn primary" onClick={() => setExam(true)}>
                  <IconCalendar size={16} /> Prüfung eintragen
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'decks' && (
          <div className="home-panel">
            {data.decks.length ? (
              <div className="deck-list">
                {[...data.decks]
                  .sort((a, b) => dueCards(b).length - dueCards(a).length || a.name.localeCompare(b.name))
                  .map((d) => (
                    <DeckRow key={d.id} deck={d} />
                  ))}
              </div>
            ) : (
              <p className="muted">Noch keine Decks.</p>
            )}
            <Link to="/library" className="small-link">
              Zur Bibliothek <IconChevron size={12} />
            </Link>
          </div>
        )}

        {tab === 'recent' && (
          <div className="home-panel">
            <div className="deck-list">
              {[...data.decks]
                .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
                .slice(0, 8)
                .map((d) => (
                  <DeckRow key={d.id} deck={d} />
                ))}
            </div>
          </div>
        )}

        {tab === 'quick' && (
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
            <button type="button" className="quick-card" onClick={() => setExam(true)}>
              <IconCalendar size={22} />
              <b>Prüfung eintragen</b>
              <small>Merkora plant bis zum Termin</small>
            </button>
          </div>
        )}
      </div>

      <aside className="home-rail">
        <WeekStreak serie={serie} />
        <div className="widget">
          <div>
            <small>Heute gelernte Karten</small>
            <b className="w-num">
              <span className="green">{cardsToday}</span> /{CARD_GOAL}
            </b>
          </div>
          <Ring value={cardsToday} goal={CARD_GOAL} color="var(--primary)">
            <IconCards size={20} />
          </Ring>
        </div>
        <div className="widget">
          <div>
            <small>Lernzeit heute (Min.)</small>
            <b className="w-num">
              <span className="amber">{minutesToday}</span> /{MINUTE_GOAL}
            </b>
          </div>
          <Ring value={minutesToday} goal={MINUTE_GOAL} color="#f2b84b">
            <IconFlame size={20} />
          </Ring>
        </div>
        <div className="widget pomo-widget">
          <Pomodoro big />
        </div>
        <MiniCalendar />
      </aside>

      {create && <CreateWithAI initialNotes={create.notes} initialFile={create.file} onClose={() => setCreate(null)} />}
      {anki && <AnkiImport onClose={() => setAnki(false)} />}
      {exam && <ExamDialog onClose={() => setExam(false)} />}
    </div>
  );
}

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** This week Monday–Sunday: learned days filled, today outlined. */
function WeekStreak({ serie }: { serie: number }) {
  const data = useStore((s) => s.data);
  const today = startOfDay(Date.now());
  const monday = today - ((new Date(today).getDay() + 6) % 7) * DAY;
  const learned = new Set([...data.reviews.map((r) => dayKey(r.at)), ...Object.keys(data.game.xpByDay).filter((k) => data.game.xpByDay[k] > 0)]);
  return (
    <div className="widget streak-widget">
      <b className="streak-title">
        <IconFlame size={18} /> {serie} {serie === 1 ? 'Tag' : 'Tage'} Serie
      </b>
      <div className="streak-days">
        {WD.map((w, i) => {
          const d = monday + i * DAY;
          const k = dayKey(d);
          return (
            <span key={w} className={`sd ${learned.has(k) ? 'done' : ''} ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}`}>
              <i>{new Date(d).getDate()}</i>
              <small>{w}</small>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Small month calendar; exam days are marked and link to the calendar. */
function MiniCalendar() {
  const data = useStore((s) => s.data);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const examDays = new Map(data.exams.map((e) => [e.date, e.title]));
  const first = (month.getDay() + 6) % 7;
  const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = dayKey(Date.now());
  const next = upcomingExams(data)[0];
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
        <Link to="/calendar" className="small-link">
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
          return (
            <Link key={k} to="/calendar" className={`mcal-day ${k === today ? 'today' : ''} ${ex ? 'exam' : ''}`} title={ex ?? ''}>
              {i + 1}
            </Link>
          );
        })}
      </div>
      {next && (
        <small className="muted">
          Nächste Prüfung: <b>{next.title}</b> · {new Date(examAt(next)).toLocaleDateString('de-DE')} ({countdownText(next)})
        </small>
      )}
    </div>
  );
}
