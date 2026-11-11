import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { closeWeekReview, deckUrl, recordMasterySnapshot, useData } from '../lib/store';
import { reviewWeekKey, weekReview } from '../lib/weekly';
import { IconClose } from './Icons';
import { Mascot } from './Mascot';

const fmtMin = (m: number) => (m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std. ${m % 60 ? `${m % 60} Min.` : ''}`.trim());

/** Takes the daily mastery snapshot – mounted once in the layout. */
export function MasterySnapshots() {
  useEffect(() => {
    recordMasterySnapshot();
    const t = setInterval(() => recordMasterySnapshot(), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return null;
}

/**
 * „Deine Woche“: cards, time, accuracy, new cards and the decks that grew most.
 * On the start page it appears on Sunday and Monday (closable); in the statistics it is always there.
 */
export function WeekReview({ always = false }: { always?: boolean }) {
  const data = useData();
  const week = reviewWeekKey();
  if (!always && (!week || data.game.weekSeen === week)) return null;
  const w = weekReview(data);
  if (!always && w.reviews === 0) return null;
  const diff = w.reviews - w.prevReviews;
  const say =
    w.reviews === 0
      ? 'Diese Woche war ruhig – nächste Woche packen wir’s!'
      : diff > 0 && w.prevReviews > 0
        ? `${diff} Karten mehr als letzte Woche!`
        : w.activeDays >= 6
          ? 'Fast jeden Tag gelernt – vorbildlich!'
          : 'Schön, dass du drangeblieben bist.';

  return (
    <section className="panel week-review" aria-label="Wochenrückblick">
      <div className="panel-head">
        <h2>Deine Woche</h2>
        {!always && week && (
          <button type="button" className="icon-btn" aria-label="Wochenrückblick schließen" onClick={() => closeWeekReview(week)}>
            <IconClose size={16} />
          </button>
        )}
      </div>
      <div className="week-top">
        <Mascot who="pip" mood={w.reviews ? 'cheer' : 'wave'} size={72} say={say} />
      </div>
      <div className="week-tiles">
        <div>
          <b>{w.reviews}</b>
          <small>Karten wiederholt</small>
          {w.prevReviews > 0 && <em className={diff >= 0 ? 'up' : 'down'}>{diff >= 0 ? `+${diff}` : diff} zur Vorwoche</em>}
        </div>
        <div>
          <b>{fmtMin(w.minutes)}</b>
          <small>Lernzeit</small>
        </div>
        <div>
          <b>{w.activeDays} / 7</b>
          <small>Tage gelernt</small>
        </div>
        <div>
          <b>{w.correct === null ? '–' : `${w.correct} %`}</b>
          <small>gewusst</small>
        </div>
        <div>
          <b>{w.newLearned}</b>
          <small>neue Karten</small>
        </div>
      </div>
      {w.decks.length > 0 && (
        <>
          <h3>Größter Fortschritt</h3>
          <ul className="week-decks">
            {w.decks.map((x) => {
              const deck = data.decks.find((d) => d.id === x.id)!;
              return (
                <li key={x.id}>
                  <Link to={deckUrl(data, deck)}>{x.name}</Link>
                  <span className="bar mini">
                    <i style={{ width: `${x.to}%` }} />
                  </span>
                  <span className={x.to >= x.from ? 'up' : 'down'}>
                    {x.from} % → {x.to} %
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {w.busiestDay && w.busiestDay.n >= 10 && (
        <p className="muted small">
          Fleißigster Tag: {new Date(w.busiestDay.day).toLocaleDateString('de-DE', { weekday: 'long' })} mit {w.busiestDay.n} Karten
          {w.streak > 1 ? ` · Lernserie: ${w.streak} Tage` : ''}
        </p>
      )}
    </section>
  );
}
