import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { groupTotals, levelCounts, masteryPercent, statsTree, streak, type DeckStat, type StatTotals } from '../lib/stats';
import { deckUrl, dueCards, setSettings, useData } from '../lib/store';
import { IconCards, IconChevronDown, IconFolder } from '../components/Icons';
import { DAY, dayKey, startOfDay } from '../lib/util';
import { WeekReview } from '../components/WeekReview';

/** Small hover tooltip shared by the charts. */
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; text: ReactNode } | null>(null);
  const show = (e: React.MouseEvent | React.FocusEvent, text: ReactNode) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, text });
  };
  const node = tip && (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.text}
    </div>
  );
  return { show, hide: () => setTip(null), node };
}

const fmtMinutes = (m: number) => (m < 60 ? `${Math.round(m)} Min.` : `${Math.floor(m / 60)} Std. ${Math.round(m % 60)} Min.`);
const fmtDay = (t: number) => new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });

export default function Stats() {
  const data = useData();
  useEffect(() => {
    document.title = 'Statistik – Merkora';
  }, []);
  const now = Date.now();
  const today = startOfDay(now);
  const tip = useTip();

  // ---- summary
  const cards = data.decks.flatMap((d) => d.cards);
  const counts = levelCounts(cards);
  const last30 = data.reviews.filter((r) => r.at >= today - 29 * DAY);
  const correct30 = last30.length ? Math.round((last30.filter((r) => r.rating >= 3).length / last30.length) * 100) : null;

  // ---- year heatmap (53 weeks, Monday first)
  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.reviews) m.set(dayKey(r.at), (m.get(dayKey(r.at)) ?? 0) + 1);
    return m;
  }, [data.reviews]);
  const weekday = (new Date(today).getDay() + 6) % 7;
  const start = today - (52 * 7 + weekday) * DAY;
  const days = Array.from({ length: 52 * 7 + weekday + 1 }, (_, i) => start + i * DAY);
  const maxDay = Math.max(1, ...days.map((d) => perDay.get(dayKey(d)) ?? 0));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / maxDay) * 4)));
  const activeDays = days.filter((d) => (perDay.get(dayKey(d)) ?? 0) > 0).length;

  // ---- forecast: cards due per day, next 30 days (overdue counts today)
  const forecast = Array.from({ length: 30 }, (_, i) => {
    const from = today + i * DAY;
    const n = cards.filter((c) => c.srs.last && (i === 0 ? c.srs.due < from + DAY : c.srs.due >= from && c.srs.due < from + DAY)).length;
    return { day: from, n };
  });
  const maxF = Math.max(1, ...forecast.map((f) => f.n));
  const total30 = forecast.reduce((a, f) => a + f.n, 0);

  // ---- study time (Pomodoro + learning), last 7 days
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = today - (6 - i) * DAY;
    return { day: d, min: data.game.minutesByDay?.[dayKey(d)] ?? 0 };
  });
  const maxW = Math.max(1, ...week.map((w) => w.min));

  // ---- per deck, grouped like the library (workspace → course → folder → deck)
  const rows: DeckStat[] = data.decks.map((d) => {
    const rv = last30.filter((r) => r.deckId === d.id);
    return {
      deckId: d.id,
      name: d.name,
      cards: d.cards.length,
      mastery: masteryPercent(d.cards),
      due: dueCards(d, now).length,
      reviews: rv.length,
      known: rv.filter((r) => r.rating >= 3).length,
    };
  });
  const tree = statsTree(data, rows);
  const allTotals = groupTotals(rows);
  const openIds = new Set(data.settings.statsOpen?.groups ?? []);
  const sectionOpen = data.settings.statsOpen?.section !== false;
  const groupIds = tree.flatMap((w) => w.courses.flatMap((c) => [c.id, ...c.folders.map((f) => f.id)]));
  const setOpen = (groups: string[], section = sectionOpen) => setSettings({ statsOpen: { section, groups } });
  const toggle = (id: string) => setOpen(openIds.has(id) ? [...openIds].filter((x) => x !== id) : [...openIds, id]);
  const cells = (t: StatTotals) => (
    <>
      <td>{t.cards}</td>
      <td>
        <span className="bar mini">
          <i style={{ width: `${t.mastery}%` }} />
        </span>{' '}
        {t.mastery}%
      </td>
      <td>{t.due}</td>
      <td>{t.reviews}</td>
      <td>{t.correct === null ? '–' : `${t.correct}%`}</td>
    </>
  );
  const deckLine = (r: DeckStat, depth: number) => {
    const deck = data.decks.find((d) => d.id === r.deckId)!;
    return (
      <tr key={r.deckId} className={`st-deck depth-${depth}`}>
        <td>
          <span className="st-name">
            <IconCards size={14} />
            <Link to={deckUrl(data, deck)} title={r.name}>
              {r.name}
            </Link>
          </span>
        </td>
        {cells(groupTotals([r]))}
      </tr>
    );
  };
  const groupLine = (id: string, name: string, t: StatTotals, kind: 'course' | 'folder', depth: number) => (
    <tr key={id} className={`st-group st-${kind} depth-${depth}`}>
      <td>
        <button type="button" className="st-toggle" aria-expanded={openIds.has(id)} onClick={() => toggle(id)}>
          <IconChevronDown size={14} className="fold-chev" />
          <IconFolder size={15} />
          <b title={name}>{name}</b>
        </button>
      </td>
      {cells(t)}
    </tr>
  );

  return (
    <div className="page">
      <header className="page-head">
        <h1>Statistik</h1>
      </header>

      <div className="stat-tiles">
        <div className="stat-tile">
          <small>Lernserie</small>
          <b>{streak(data.reviews)}</b>
          <span>Tage in Folge</span>
        </div>
        <div className="stat-tile">
          <small>Wiederholungen</small>
          <b>{last30.length}</b>
          <span>in den letzten 30 Tagen</span>
        </div>
        <div className="stat-tile">
          <small>Gewusst</small>
          <b>{correct30 === null ? '–' : `${correct30}%`}</b>
          <span>„Gut“ oder „Einfach“ (30 Tage)</span>
        </div>
        <div className="stat-tile">
          <small>Lernzeit</small>
          <b>{fmtMinutes(week.reduce((a, w) => a + w.min, 0))}</b>
          <span>in den letzten 7 Tagen</span>
        </div>
        <div className="stat-tile">
          <small>Gemeistert</small>
          <b>{counts.mastered}</b>
          <span>von {cards.length} Karten</span>
        </div>
      </div>

      <WeekReview always />

      <section className="panel">
        <div className="panel-head">
          <h2>Lernaktivität im letzten Jahr</h2>
          <small className="muted">{activeDays} Lerntage</small>
        </div>
        <div className="heatmap-scroll">
          <div className="heatmap" role="img" aria-label={`Wiederholungen pro Tag, ${activeDays} Lerntage im letzten Jahr`}>
            {days.map((d) => {
              const n = perDay.get(dayKey(d)) ?? 0;
              return (
                <span
                  key={d}
                  className={`hm l${level(n)}`}
                  tabIndex={-1}
                  onMouseEnter={(e) => tip.show(e, <><b>{n} Wiederholungen</b><br />{fmtDay(d)}</>)}
                  onMouseLeave={tip.hide}
                />
              );
            })}
          </div>
        </div>
        <div className="hm-legend" aria-hidden="true">
          <small>weniger</small>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`hm l${l}`} />
          ))}
          <small>mehr</small>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Lernzeit pro Tag</h2>
          <small className="muted">mit Pomodoro-Timer und beim Lernen gemessen</small>
        </div>
        <div className="forecast week" role="img" aria-label="Lernminuten der letzten 7 Tage">
          {week.map((w) => (
            <div
              key={w.day}
              className="fc-col"
              onMouseEnter={(e) => tip.show(e, <><b>{fmtMinutes(w.min)}</b><br />{fmtDay(w.day)}</>)}
              onMouseLeave={tip.hide}
            >
              <i style={{ height: `${(w.min / maxW) * 100}%` }} className={w.min ? '' : 'zero'} />
            </div>
          ))}
        </div>
        <div className="fc-axis">
          {week.map((w) => (
            <small key={w.day}>{new Date(w.day).toLocaleDateString('de-DE', { weekday: 'short' })}</small>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Fällige Karten in den nächsten 30 Tagen</h2>
          <small className="muted">{total30} insgesamt</small>
        </div>
        <div className="forecast" role="img" aria-label="Fällige Karten pro Tag, nächste 30 Tage">
          {forecast.map((f, i) => (
            <div
              key={f.day}
              className="fc-col"
              onMouseEnter={(e) => tip.show(e, <><b>{f.n} Karten</b><br />{i === 0 ? 'heute (inkl. überfällige)' : fmtDay(f.day)}</>)}
              onMouseLeave={tip.hide}
            >
              <i style={{ height: `${(f.n / maxF) * 100}%` }} className={f.n ? '' : 'zero'} />
            </div>
          ))}
        </div>
        <div className="fc-axis">
          <small>heute</small>
          <small>in 2 Wochen</small>
          <small>in 30 Tagen</small>
        </div>
        <details className="table-view">
          <summary>Als Tabelle</summary>
          <table>
            <tbody>
              {forecast
                .filter((f) => f.n)
                .map((f) => (
                  <tr key={f.day}>
                    <td>{fmtDay(f.day)}</td>
                    <td>{f.n}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className={`panel fold-panel st-panel ${sectionOpen ? '' : 'folded'}`}>
        <div className="fold-head">
          <button type="button" className="fold-toggle" aria-expanded={sectionOpen} onClick={() => setOpen([...openIds], !sectionOpen)}>
            <IconChevronDown size={16} className="fold-chev" />
            <h2>Decks</h2>
            <small className="muted fold-sum">
              {rows.length} {rows.length === 1 ? 'Deck' : 'Decks'} · {allTotals.cards} Karten
            </small>
          </button>
          {sectionOpen && groupIds.length > 0 && (
            <span className="row-gap">
              <button type="button" className="link-btn" onClick={() => setOpen(groupIds)}>
                Alle aufklappen
              </button>
              <button type="button" className="link-btn" onClick={() => setOpen([])}>
                Alle zuklappen
              </button>
            </span>
          )}
        </div>
        {sectionOpen && (
          <div className="table-wrap fold-body">
            <table className="deck-stats">
              <thead>
                <tr>
                  <th>Kurs / Ordner / Deck</th>
                  <th>Karten</th>
                  <th>Fortschritt</th>
                  <th>Fällig</th>
                  <th>Wiederholt (30 T.)</th>
                  <th>Gewusst</th>
                </tr>
              </thead>
              {tree.map((w) => (
                <tbody key={w.id}>
                  {tree.length > 1 && (
                    <tr className="st-ws">
                      <td colSpan={6}>{w.name}</td>
                    </tr>
                  )}
                  {w.courses.flatMap((c) => [
                    groupLine(c.id, c.name, c.totals, 'course', 0),
                    ...(openIds.has(c.id)
                      ? [
                          ...c.folders.flatMap((f) => [groupLine(f.id, f.name, f.totals, 'folder', 1), ...(openIds.has(f.id) ? f.decks.map((r) => deckLine(r, 2)) : [])]),
                          ...c.decks.map((r) => deckLine(r, 1)),
                        ]
                      : []),
                  ])}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>
      {tip.node}
    </div>
  );
}
