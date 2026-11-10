import { useState } from 'react';
import { IconCards, IconCheck, IconFlame, IconPlay, IconRefresh } from '../../components/Icons';
import { ConfirmModal } from '../../components/Modal';
import { cardFrontText } from '../../lib/content';
import { LEVELS, levelOf, type Level } from '../../lib/srs';
import { resetProgress, dueCards, type Deck, type Review } from '../../lib/store';
import { levelCounts, masteryPercent, perDay, streak } from '../../lib/stats';
import { formatDue } from '../../lib/util';

function Ring({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#ddf0e4" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#0f8552"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="ring-label">
        <b>{pct}%</b>
        <small>Beherrschung</small>
      </div>
    </div>
  );
}

export default function MasteryTab({ deck, reviews, onLearn }: { deck: Deck; reviews: Review[]; onLearn: () => void }) {
  const [filter, setFilter] = useState<Level | 'all'>('all');
  const [confirm, setConfirm] = useState(false);
  const counts = levelCounts(deck.cards);
  const total = deck.cards.length;
  const pct = masteryPercent(deck.cards);
  const due = dueCards(deck).length;
  const days = perDay(reviews, 14);
  const max = Math.max(1, ...days.map((d) => d.count));
  const correct = reviews.length ? Math.round((reviews.filter((r) => r.rating >= 3).length / reviews.length) * 100) : 0;
  const shown = filter === 'all' ? deck.cards : deck.cards.filter((c) => levelOf(c.srs) === filter);

  return (
    <div className="mastery">
      <div className="mastery-top">
        <section className="panel mastery-summary">
          <Ring pct={pct} />
          <div className="mastery-text">
            <h2>Dein Lernfortschritt</h2>
            <p className="muted">
              {total === 0
                ? 'Füge Karten hinzu, um deinen Fortschritt zu sehen.'
                : pct >= 80
                  ? 'Hervorragend – fast alles sitzt!'
                  : pct >= 40
                    ? 'Du bist auf einem guten Weg. Bleib dran!'
                    : 'Jeder Durchgang bringt dich weiter.'}
            </p>
            <button type="button" className="btn primary" onClick={onLearn} disabled={!total}>
              <IconPlay size={12} /> {due ? `${due} fällige Karten lernen` : 'Weiter üben'}
            </button>
          </div>
        </section>
        <div className="mini-stats">
          <div className="stat">
            <span className="stat-icon purple">
              <IconCards />
            </span>
            <b>{total}</b>
            <small>Karten</small>
          </div>
          <div className="stat">
            <span className="stat-icon orange">
              <IconFlame />
            </span>
            <b>{streak(reviews)}</b>
            <small>Tage Serie</small>
          </div>
          <div className="stat">
            <span className="stat-icon green">
              <IconCheck />
            </span>
            <b>{correct}%</b>
            <small>gewusst</small>
          </div>
          <div className="stat">
            <span className="stat-icon blue">
              <IconRefresh />
            </span>
            <b>{reviews.length}</b>
            <small>Wiederholungen</small>
          </div>
        </div>
      </div>

      <section className="panel">
        <h3>Beherrschungsstufen</h3>
        <div className="stack-bar" role="img" aria-label="Verteilung der Karten nach Stufe">
          {LEVELS.map((l) =>
            counts[l.id] ? <span key={l.id} style={{ width: `${(counts[l.id] / Math.max(1, total)) * 100}%`, background: l.color }} /> : null,
          )}
        </div>
        <div className="level-grid">
          {LEVELS.map((l) => (
            <button
              type="button"
              key={l.id}
              className={`level-tile ${filter === l.id ? 'on' : ''}`}
              onClick={() => setFilter(filter === l.id ? 'all' : l.id)}
            >
              <span className="dot" style={{ background: l.color }} />
              <b>{counts[l.id]}</b>
              <span>{l.label}</span>
              <small>{l.hint}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Aktivität der letzten 14 Tage</h3>
        <div className="activity">
          {days.map((d) => (
            <div key={d.day} className="act-col" title={`${new Date(d.day).toLocaleDateString('de-DE')}: ${d.count}`}>
              <span className="act-bar" style={{ height: `${(d.count / max) * 100}%` }} />
              <small>{new Date(d.day).getDate()}.</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>
            {filter === 'all' ? 'Alle Karten' : LEVELS.find((l) => l.id === filter)!.label} ({shown.length})
          </h3>
          <button type="button" className="btn ghost sm" onClick={() => setConfirm(true)} disabled={!reviews.length && !deck.cards.some((c) => c.srs.last)}>
            <IconRefresh size={14} /> Fortschritt zurücksetzen
          </button>
        </div>
        <div className="mastery-list">
          {shown.slice(0, 300).map((c) => {
            const l = LEVELS.find((x) => x.id === levelOf(c.srs))!;
            return (
              <div key={c.id} className="mastery-row">
                <span className="dot" style={{ background: l.color }} />
                <span className="m-front">{cardFrontText(c) || '[Bild]'}</span>
                <span className="level-badge" style={{ ['--c' as string]: l.color }}>
                  {l.label}
                </span>
                <small className="m-due">{c.srs.last ? formatDue(c.srs.due) : '–'}</small>
              </div>
            );
          })}
          {!shown.length && <p className="muted small">Keine Karten auf dieser Stufe.</p>}
          {shown.length > 300 && <p className="muted small">… und {shown.length - 300} weitere Karten.</p>}
        </div>
      </section>
      {confirm && (
        <ConfirmModal
          title="Fortschritt zurücksetzen?"
          text="Alle Karten dieses Decks gelten danach wieder als neu."
          confirm="Zurücksetzen"
          onClose={() => setConfirm(false)}
          onConfirm={() => resetProgress(deck.id)}
        />
      )}
    </div>
  );
}
