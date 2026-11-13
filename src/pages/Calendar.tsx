import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExamDialog } from '../components/ExamDialog';
import { IconCalendar, IconChevron, IconDownload, IconEdit, IconPlay, IconPlus, IconTrash } from '../components/Icons';
import { ConfirmModal } from '../components/Modal';
import { StudySession, weakestFirst, type SessionItem } from '../components/StudySession';
import { countdownText, dailyPlan, examAt, examCards, examDecks, pastExams, readiness, toIcs, upcomingExams } from '../lib/exams';
import { levelOf } from '../lib/srs';
import { deckUrl, deleteExam, useData, type Exam } from '../lib/store';
import { dayKey, download } from '../lib/util';

const WEEK = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function ExamCard({ exam, onEdit, onDelete, onPractice }: { exam: Exam; onEdit: () => void; onDelete: () => void; onPractice: () => void }) {
  const data = useData();
  const [open, setOpen] = useState(false);
  const r = readiness(data, exam);
  const plan = dailyPlan(data, exam);
  const decks = examDecks(data, exam);
  const when = new Date(examAt(exam)).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const whole = (exam.courseIds?.length ?? 0) + (exam.folderIds?.length ?? 0) > 0;
  return (
    <article className={'exam-card' + (open ? ' open' : '')}>
      <div className="exam-date">
        <b>{new Date(examAt(exam)).getDate()}</b>
        <small>{new Date(examAt(exam)).toLocaleDateString('de-DE', { month: 'short' })}</small>
      </div>
      <div className="grow">
        {/* compact: title, countdown and how ready – a click shows the details */}
        <button type="button" className="exam-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <IconChevron size={14} className="exam-chev" />
          <h3>{exam.title}</h3>
          <span className="pill-count">{countdownText(exam)}</span>
        </button>
        {decks.length > 0 && (
          <div className="exam-ready">
            <span className="bar">
              <i style={{ width: `${r.percent}%` }} />
            </span>
            <small>{r.percent}% vorbereitet</small>
          </div>
        )}
        {open && (
          <div className="exam-details">
            <p className="muted small">
              {when}
              {exam.time ? `, ${exam.time} Uhr` : ''}
              {exam.note ? ` · ${exam.note}` : ''}
            </p>
            {decks.length ? (
              <>
                <p className="small">
                  {plan.left > 0 ? (
                    <>
                      Heute noch <b>{plan.left} Karten</b> ({plan.doneToday} geschafft)
                    </>
                  ) : (
                    <>Tagesziel erreicht ✓</>
                  )}{' '}
                  · {r.open} von {r.total} Karten noch nicht sicher
                </p>
                {whole && <p className="muted small">Ganze Kurse oder Ordner – neue Decks darin zählen automatisch mit.</p>}
                <div className="exam-deck-links">
                  {decks.map((d) => (
                    <Link key={d.id} to={deckUrl(data, d, 'learn')} className="chip">
                      {d.name}
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted small">Noch keine Decks verknüpft.</p>
            )}
            <div className="row-gap">
              <button type="button" className="btn ghost sm" onClick={onEdit}>
                <IconEdit size={14} /> Bearbeiten
              </button>
              <button type="button" className="btn ghost sm danger-text" onClick={onDelete}>
                <IconTrash size={14} /> Löschen
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="exam-actions">
        {r.total > 0 && (
          <button type="button" className="btn primary sm" onClick={onPractice}>
            <IconPlay size={12} /> Üben
          </button>
        )}
      </div>
    </article>
  );
}

export default function CalendarPage() {
  const data = useData();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [edit, setEdit] = useState<{ exam?: Exam; date?: string } | null>(null);
  const [del, setDel] = useState<Exam | null>(null);
  const [practice, setPractice] = useState<{ title: string; items: SessionItem[] } | null>(null);
  const [showPast, setShowPast] = useState(false);
  useEffect(() => {
    document.title = 'Prüfungen – Merkora';
  }, []);

  const upcoming = upcomingExams(data);
  const past = pastExams(data);
  const byDay = useMemo(() => {
    const m = new Map<string, Exam[]>();
    for (const e of data.exams) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [data.exams]);
  // open to-dos with a date appear on their day too
  const todosByDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of data.todos ?? []) if (t.due && !t.doneAt) m.set(t.due, [...(m.get(t.due) ?? []), t.text]);
    return m;
  }, [data.todos]);

  // Month grid starting on Monday
  const first = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - first + 1;
    return day >= 1 && day <= daysInMonth ? new Date(month.getFullYear(), month.getMonth(), day) : null;
  });
  const today = dayKey(Date.now());

  const startPractice = (e: Exam) => {
    const now = Date.now();
    const items = examDecks(data, e).flatMap((d) =>
      d.cards.map((c) => ({ deckId: d.id, cardId: c.id, due: c.srs.due, ease: c.srs.ease, learned: levelOf(c.srs) === 'mastered' })),
    );
    setPractice({ title: `Üben für „${e.title}“`, items: weakestFirst(items, now).slice(0, Math.max(20, dailyPlan(data, e).left)) });
  };

  if (practice) return <div className="page">{<StudySession title={practice.title} items={practice.items} onExit={() => setPractice(null)} />}</div>;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Prüfungen</h1>
        <div className="row-gap">
          {data.exams.length > 0 && (
            <button
              type="button"
              className="btn outline"
              onClick={() => download('merkora-pruefungen.ics', toIcs(data.exams, data.decks), 'text/calendar')}
            >
              <IconDownload size={16} /> In Kalender exportieren
            </button>
          )}
          <button type="button" className="btn primary" onClick={() => setEdit({})}>
            <IconPlus size={16} /> Prüfung eintragen
          </button>
        </div>
      </header>

      <div className="calendar-grid-wrap">
        <section className="panel month">
          <div className="month-head">
            <button
              type="button"
              className="icon-btn flip"
              aria-label="Vorheriger Monat"
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            >
              <IconChevron size={16} />
            </button>
            <b>{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</b>
            <button
              type="button"
              className="icon-btn"
              aria-label="Nächster Monat"
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            >
              <IconChevron size={16} />
            </button>
          </div>
          <div className="month-grid">
            {WEEK.map((w) => (
              <span key={w} className="wd">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={i} className="day empty" />;
              const k = dayKey(d.getTime());
              const exams = byDay.get(k) ?? [];
              const todos = todosByDay.get(k) ?? [];
              return (
                <button
                  type="button"
                  key={i}
                  className={`day ${k === today ? 'today' : ''} ${exams.length ? 'has-exam' : ''} ${k < today ? 'past' : ''}`}
                  title={[...exams.map((e) => e.title), ...todos.map((t) => 'To-do: ' + t)].join(', ') || 'Prüfung an diesem Tag eintragen'}
                  onClick={() => (exams.length ? setEdit({ exam: exams[0] }) : setEdit({ date: k }))}
                >
                  <span>{d.getDate()}</span>
                  {exams.slice(0, 2).map((e) => (
                    <i key={e.id}>{e.title}</i>
                  ))}
                  {todos.length > 0 && exams.length < 2 && (
                    <i className="day-todo">
                      {todos.length === 1 ? todos[0] : `${todos.length} To-dos`}
                    </i>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="exam-list">
          <h2>Anstehende Prüfungen</h2>
          {upcoming.length === 0 && (
            <div className="empty">
              <IconCalendar size={28} />
              <b>Keine Prüfungen eingetragen</b>
              <p className="muted">Trag deine Prüfungstermine ein und verknüpfe die passenden Decks. Merkora plant dann so, dass jede Karte vorher noch einmal drankommt.</p>
              <button type="button" className="btn primary" onClick={() => setEdit({})}>
                <IconPlus size={16} /> Prüfung eintragen
              </button>
            </div>
          )}
          {upcoming.map((e) => (
            <ExamCard key={e.id} exam={e} onEdit={() => setEdit({ exam: e })} onDelete={() => setDel(e)} onPractice={() => startPractice(e)} />
          ))}
          {past.length > 0 && (
            <>
              <button type="button" className="link-btn" onClick={() => setShowPast((v) => !v)}>
                {showPast ? 'Vergangene Prüfungen ausblenden' : `Vergangene Prüfungen anzeigen (${past.length})`}
              </button>
              {showPast &&
                past.map((e) => (
                  <div key={e.id} className="exam-past">
                    <span>
                      {new Date(examAt(e)).toLocaleDateString('de-DE')} · <b>{e.title}</b> · {examCards(data, e).length} Karten
                    </span>
                    <button type="button" className="icon-btn" aria-label="Löschen" onClick={() => setDel(e)}>
                      <IconTrash size={14} />
                    </button>
                  </div>
                ))}
            </>
          )}
        </section>
      </div>

      {edit && <ExamDialog exam={edit.exam} presetDate={edit.date} onClose={() => setEdit(null)} />}
      {del && (
        <ConfirmModal
          title="Prüfung löschen?"
          text={`„${del.title}“ wird entfernt. Die Decks und Karten bleiben erhalten.`}
          onClose={() => setDel(null)}
          onConfirm={() => deleteExam(del.id)}
        />
      )}
    </div>
  );
}
