import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnkiImport } from '../components/AnkiImport';
import { CreateWithAI } from '../components/CreateWithAI';
import { IconCards, IconCheck, IconFlame, IconPlay, IconStar, IconSparkle, IconUpload } from '../components/Icons';
import { NoKeyNotice } from '../components/NoKey';
import { pathProgress, xpStreak, xpToday } from '../lib/path';
import { Mascot } from '../components/Mascot';
import { deckUrl, dueCards, useStore } from '../lib/store';
import { levelCounts, masteryPercent, perDay, streak } from '../lib/stats';
import { GameBar } from './tabs/PathTab';
import { countdownText, dailyPlan, readiness, upcomingExams } from '../lib/exams';
import { IconCalendar } from '../components/Icons';

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export default function Dashboard() {
  const data = useStore((s) => s.data);
  const apiKey = useStore((s) => s.apiKey);
  const [create, setCreate] = useState(false);
  const [anki, setAnki] = useState(false);
  useEffect(() => {
    document.title = 'Übersicht – Merkora';
  }, []);

  const allCards = data.decks.flatMap((d) => d.cards);
  const due = data.decks.reduce((a, d) => a + dueCards(d).length, 0);
  const mastered = levelCounts(allCards).mastered;
  const days = perDay(data.reviews, 7);
  const max = Math.max(1, ...days.map((d) => d.count));
  const hour = new Date().getHours();
  const hello = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const firstDue = data.decks.find((d) => dueCards(d).length > 0);
  const pathDeck = data.decks
    .filter((d) => d.cards.length)
    .map((d) => ({ deck: d, p: pathProgress(d) }))
    .sort((a, b) => Math.max(0, ...Object.values(b.deck.path ?? {}).map((r) => r.at)) - Math.max(0, ...Object.values(a.deck.path ?? {}).map((r) => r.at)))
    .find((x) => x.p.done < x.p.total);

  return (
    <div className="page">
      <header className="page-head">
        <Mascot who="flo" mood={xpToday(data) >= data.game.dailyGoal ? 'cheer' : xpStreak(data) > 0 ? 'happy' : 'wave'} size={76} className="dash-mascot" />
        <div className="grow">
          <h1>{hello}! Bereit zum Lernen?</h1>
          <p className="muted">
            {xpToday(data) >= data.game.dailyGoal
              ? 'Flo freut sich: Tagesziel geschafft! '
              : xpStreak(data) > 0
                ? `Flo sagt: Halte deine ${xpStreak(data)}-Tage-Serie am Leben! `
                : 'Flo sagt: Ein paar Karten am Tag reichen schon. '}
            {due > 0 ? `Heute sind ${due} Karten fällig.` : 'Für heute ist alles wiederholt – stark!'}
          </p>
        </div>
        {firstDue && (
          <Link to={deckUrl(data, firstDue, 'learn')} className="btn primary">
            <IconPlay size={14} /> Jetzt lernen
          </Link>
        )}
      </header>

      {!apiKey && data.settings.provider !== 'custom' && !data.settings.useFreeKey && <NoKeyNotice />}

      <GameBar />
      <UpcomingExams />
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

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-icon purple">
            <IconCards />
          </span>
          <b>{due}</b>
          <small>Heute fällig</small>
        </div>
        <div className="stat">
          <span className="stat-icon orange">
            <IconFlame />
          </span>
          <b>{Math.max(xpStreak(data), streak(data.reviews))}</b>
          <small>Tage Lernserie</small>
        </div>
        <div className="stat">
          <span className="stat-icon blue">
            <IconCards />
          </span>
          <b>{allCards.length}</b>
          <small>Karten gesamt</small>
        </div>
        <div className="stat">
          <span className="stat-icon green">
            <IconCheck />
          </span>
          <b>{mastered}</b>
          <small>Gemeistert</small>
        </div>
      </div>

      <div className="dash-grid">
        <section className="panel create-panel">
          <h2>Neues Lernset erstellen</h2>
          <p className="muted">Lade ein PDF hoch oder füge Notizen ein – die KI macht daraus Karteikarten, eine Zusammenfassung, ein Quiz und einen Podcast.</p>
          <button type="button" className="dropzone big" onClick={() => setCreate(true)}>
            <IconUpload size={28} />
            <b>Datei hochladen oder Text einfügen</b>
            <span>PDF, TXT oder Markdown</span>
          </button>
          <div className="row-gap">
            <button type="button" className="btn primary" onClick={() => setCreate(true)}>
              <IconSparkle size={16} /> Mit KI erstellen
            </button>
            <button type="button" className="btn outline" onClick={() => setAnki(true)}>
              <IconUpload size={16} /> Aus Anki-Stapel (.apkg)
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>Diese Woche</h2>
          <div className="week">
            {days.map((d) => (
              <div key={d.day} className="week-col" title={`${d.count} Wiederholungen`}>
                <span className="week-n">{d.count || ''}</span>
                <span className="week-bar" style={{ height: `${(d.count / max) * 100}%` }} />
                <small>{WEEKDAYS[new Date(d.day).getDay()]}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Weiterlernen</h2>
          <Link to="/library" className="small-link">
            Ganze Bibliothek
          </Link>
        </div>
        {data.decks.length === 0 ? (
          <p className="muted">Noch keine Decks. Erstelle dein erstes mit der KI oder in der Bibliothek.</p>
        ) : (
          <div className="deck-list">
            {[...data.decks]
              .sort((a, b) => dueCards(b).length - dueCards(a).length)
              .map((d) => {
                const c = data.courses.find((x) => x.id === d.courseId);
                const pct = masteryPercent(d.cards);
                const n = dueCards(d).length;
                return (
                  <Link key={d.id} to={deckUrl(data, d)} className="deck-row">
                    <span className="deck-icon">
                      <IconCards />
                    </span>
                    <span className="deck-info">
                      <b>{d.name}</b>
                      <small>
                        {c?.name} · {d.cards.length} Karten
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
              })}
          </div>
        )}
      </section>
      {create && <CreateWithAI onClose={() => setCreate(false)} />}
      {anki && <AnkiImport onClose={() => setAnki(false)} />}
    </div>
  );
}

/** The next exams with countdown, readiness and today's cards. */
function UpcomingExams() {
  const data = useStore((s) => s.data);
  const exams = upcomingExams(data).slice(0, 3);
  if (!exams.length) return null;
  return (
    <section className="panel dash-exams">
      <div className="panel-head">
        <h2>
          <IconCalendar size={18} /> Nächste Prüfungen
        </h2>
        <Link to="/calendar" className="small-link">
          Kalender
        </Link>
      </div>
      {exams.map((e) => {
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
  );
}
