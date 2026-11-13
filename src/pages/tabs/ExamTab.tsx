import { useEffect, useRef, useState } from 'react';
import { CostHint } from '../../components/CostHint';
import { estimate } from '../../lib/costs';
import { useSearchParams } from 'react-router-dom';
import { IconCheck, IconClose, IconHeart, IconPause, IconPlay, IconPlus, IconRefresh, IconSparkle, IconTarget } from '../../components/Icons';
import { Confetti, Mascot } from '../../components/Mascot';
import { ConfirmModal } from '../../components/Modal';
import { NoKeyNotice } from '../../components/NoKey';
import { ShareDialog } from '../../components/ShareDialog';
import { compareResult } from '../../lib/share';
import {
  createMockExam,
  discardMockExam,
  EDU_LEVELS,
  GRADE_SCALES,
  gradeMockExam,
  learnFromMistakes,
  levelLabel,
  mistakeCards,
  pauseMockExam,
  resumeMockExam,
  setMockAnswer,
  startMockExam,
  tasksFor,
  timeLeft,
  examMaterialChars,
  type GradeScale,
} from '../../lib/mockExam';
import { useStore, type Deck, type MockExam } from '../../lib/store';
import { useAiReady } from './SummaryTab';

const TYPE_LABEL = { mc: 'Multiple Choice', short: 'Kurzantwort', open: 'Ausführliche Antwort' } as const;
const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
const pts = (n: number) => String(n).replace('.', ',');

export default function ExamTab({ deck }: { deck: Deck }) {
  const ex = deck.mockExam;
  const [newOne, setNewOne] = useState(false);
  if (!ex || newOne || ex.status === 'error') return <Setup deck={deck} error={ex?.status === 'error' ? ex.error : undefined} onStarted={() => setNewOne(false)} onCancel={ex && newOne ? () => setNewOne(false) : undefined} />;
  if (ex.status === 'generating')
    return <Waiting text="Pip schreibt deine Prüfung …" sub={`${levelLabel(ex.level)} · ${ex.minutes} Minuten · etwa ${tasksFor(ex.minutes)} Aufgaben. Das dauert meist 30–90 Sekunden – du kannst so lange woanders weiterlernen.`} />;
  if (ex.status === 'ready') return <Cover deck={deck} ex={ex} onNew={() => setNewOne(true)} />;
  if (ex.status === 'running') return <Writing deck={deck} ex={ex} />;
  if (ex.status === 'grading') return <Waiting text="Deine Prüfung wird korrigiert …" sub="Die KI bewertet deine schriftlichen Antworten anhand der Musterlösung und der Bewertungskriterien." />;
  if (ex.status === 'submitted')
    return (
      <div className="empty">
        <b>Die Auswertung hat nicht geklappt</b>
        <p className="form-error">{ex.error}</p>
        <p className="muted">Deine Antworten sind gespeichert.</p>
        <button type="button" className="btn primary" onClick={() => void gradeMockExam(deck.id)}>
          <IconRefresh size={16} /> Nochmal auswerten
        </button>
      </div>
    );
  return <Result deck={deck} ex={ex} onNew={() => setNewOne(true)} />;
}

function Waiting({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="empty mock-wait">
      <Mascot who="pip" mood="think" size={96} side="top" />
      <b>{text}</b>
      <span className="spinner" aria-hidden="true" />
      <p className="muted">{sub}</p>
    </div>
  );
}

function Setup({ deck, error, onStarted, onCancel }: { deck: Deck; error?: string; onStarted: () => void; onCancel?: () => void }) {
  const s = useStore((x) => x.data.settings);
  const courseDecks = useStore((x) => x.data.decks.filter((d) => d.courseId === deck.courseId).length);
  const ready = useAiReady();
  const [level, setLevel] = useState<string>(s.eduLevel ?? '');
  const [detail, setDetail] = useState(s.eduDetail ?? '');
  const [minutes, setMinutes] = useState(60);
  const [scope, setScope] = useState<'deck' | 'course'>('deck');
  const [scale, setScale] = useState<GradeScale>(s.gradeScale ?? 'ch');
  const hasMaterial = deck.source.trim() || deck.cards.length;

  return (
    <div className="mock-setup">
      <div className="panel">
        <div className="mock-head">
          <IconTarget size={22} />
          <div>
            <h2>Probeprüfung</h2>
            <p className="muted">
              Eine Prüfung wie die echte: mit Zeitlimit, Punkten, Multiple Choice und schriftlichen Aufgaben. Erst nach dem Abgeben wertet die
              KI alles aus – mit Note, Rückmeldung zu jeder Aufgabe und Musterlösung.
            </p>
          </div>
        </div>
        {error && <div className="form-error">Die Prüfung konnte nicht erstellt werden: {error}</div>}

        <h3>1. Dein Bildungsniveau</h3>
        <div className="level-grid" role="radiogroup" aria-label="Bildungsniveau">
          {EDU_LEVELS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={level === l.id} className={`level-opt ${level === l.id ? 'on' : ''}`} onClick={() => setLevel(l.id)}>
              <b>{l.label}</b>
              {l.hint && <small>{l.hint}</small>}
            </button>
          ))}
        </div>
        <label className="field-label" htmlFor="edu-detail">
          Fach, Studiengang oder Semester (freiwillig)
        </label>
        <input
          id="edu-detail"
          className="input"
          value={detail}
          maxLength={120}
          placeholder="z. B. Kommunikationswissenschaft, 3. Semester"
          onChange={(e) => setDetail(e.target.value)}
        />

        <h3>2. Prüfung</h3>
        <div className="form-grid">
          <div>
            <span className="field-label">Dauer</span>
            <div className="row-gap">
              {[30, 45, 60, 90, 120].map((m) => (
                <button key={m} type="button" className={`tag ${minutes === m ? 'on' : ''}`} onClick={() => setMinutes(m)}>
                  {m} Min.
                </button>
              ))}
            </div>
            <small className="muted">etwa {tasksFor(minutes)} Aufgaben</small>
          </div>
          <div>
            <span className="field-label">Stoff</span>
            <div className="row-gap">
              <button type="button" className={`tag ${scope === 'deck' ? 'on' : ''}`} onClick={() => setScope('deck')}>
                Dieses Deck
              </button>
              {courseDecks > 1 && (
                <button type="button" className={`tag ${scope === 'course' ? 'on' : ''}`} onClick={() => setScope('course')}>
                  Ganzer Kurs ({courseDecks} Decks)
                </button>
              )}
            </div>
          </div>
        </div>
        <label className="field-label" htmlFor="grade-scale">
          Notenskala
        </label>
        <select id="grade-scale" className="input" value={scale} onChange={(e) => setScale(e.target.value as GradeScale)}>
          {GRADE_SCALES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>

        {ready && hasMaterial && (
          <div className="mock-costs">
            <CostHint label="Erstellen" est={estimate.examCreate(examMaterialChars(deck, scope), tasksFor(minutes))} />
            <CostHint label="Auswerten" est={estimate.examGrade(Math.round(tasksFor(minutes) * 0.65))} />
          </div>
        )}
        {!ready ? (
          <NoKeyNotice compact />
        ) : (
          <div className="row-gap end mock-actions">
            {onCancel && (
              <button type="button" className="btn ghost" onClick={onCancel}>
                Abbrechen
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              disabled={!level || !hasMaterial}
              onClick={() => {
                onStarted();
                void createMockExam(deck, { level, detail: detail.trim(), minutes, scope, scale });
              }}
            >
              <IconSparkle size={16} /> Prüfung erstellen
            </button>
          </div>
        )}
        {!level && ready && <p className="muted small right">Wähle zuerst dein Bildungsniveau.</p>}
        {!hasMaterial && <p className="muted small">Füge zuerst Lernmaterial oder Karten hinzu.</p>}
        <p className="muted small">Erstellen und Auswerten sind zwei KI-Anfragen mit deinem eigenen API-Key.</p>
      </div>
      <History deck={deck} />
    </div>
  );
}

function Cover({ deck, ex, onNew }: { deck: Deck; ex: MockExam; onNew: () => void }) {
  const max = ex.questions.reduce((n, q) => n + q.points, 0);
  return (
    <div className="mock-cover panel">
      <small className="muted">
        {levelLabel(ex.level)}
        {ex.detail ? ` · ${ex.detail}` : ''}
      </small>
      <h2>{ex.title}</h2>
      {ex.friend && (
        <p className="mock-friend">
          Von <b>{ex.friend.name}</b> geteilt
          {ex.friend.percent !== undefined ? ` – ${ex.friend.name} hat schon geschrieben. Das Ergebnis siehst du nach deiner Abgabe.` : '.'}
        </p>
      )}
      <dl className="mock-facts">
        <div>
          <dt>Zeit</dt>
          <dd>{ex.minutes} Min.</dd>
        </div>
        <div>
          <dt>Aufgaben</dt>
          <dd>{ex.questions.length}</dd>
        </div>
        <div>
          <dt>Punkte</dt>
          <dd>{pts(max)}</dd>
        </div>
      </dl>
      {ex.instructions && <p>{ex.instructions}</p>}
      <ul className="mock-rules">
        <li>Keine Hilfsmittel – wie in der echten Prüfung.</li>
        <li>Die Zeit läuft ab dem Start. Ist sie um, wird automatisch abgegeben.</li>
        <li>Deine Antworten werden laufend gespeichert, auch wenn du die App schließt.</li>
        <li>Rückmeldung gibt es erst nach dem Abgeben.</li>
      </ul>
      <div className="row-gap end">
        <button type="button" className="btn ghost" onClick={onNew}>
          Andere Prüfung
        </button>
        <button type="button" className="btn primary" onClick={() => startMockExam(deck.id)}>
          Prüfung starten
        </button>
      </div>
    </div>
  );
}

function Writing({ deck, ex }: { deck: Deck; ex: MockExam }) {
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // latest typed text (a ref, so saving on leave never uses an old value)
  const drafts = useRef<Record<string, string>>({});
  const submitted = useRef(false);
  const left = timeLeft(ex, now);
  const paused = !!ex.pausedAt;

  const flushDrafts = () => {
    for (const [id, t] of Object.entries(timers.current)) {
      clearTimeout(t);
      setMockAnswer(deck.id, id, drafts.current[id] ?? '');
    }
    timers.current = {};
  };
  const submit = () => {
    if (submitted.current) return;
    submitted.current = true;
    flushDrafts();
    void gradeMockExam(deck.id);
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0 && !paused) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left <= 0]);
  // keep typed text when the tab is left
  useEffect(() => () => flushDrafts(), // eslint-disable-line react-hooks/exhaustive-deps
  []);

  const write = (id: string, v: string) => {
    drafts.current[id] = v;
    setDraft((d) => ({ ...d, [id]: v }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      delete timers.current[id];
      setMockAnswer(deck.id, id, v);
    }, 800);
  };
  const value = (id: string) => draft[id] ?? String(ex.answers[id] ?? '');
  const answered = ex.questions.filter((q) => (q.type === 'mc' ? ex.answers[q.id] !== undefined : value(q.id).trim())).length;
  const max = ex.questions.reduce((n, q) => n + q.points, 0);

  return (
    <div className="mock-writing">
      <div className={`mock-bar ${left < 5 * 60_000 ? 'hurry' : ''}`}>
        <b className="mock-clock" aria-live={left < 60_000 ? 'polite' : 'off'}>
          {fmtClock(left)}
        </b>
        <span className="muted">
          {answered} / {ex.questions.length} beantwortet · {pts(max)} Punkte
        </span>
        {!paused && (
          <button
            type="button"
            className="btn outline sm"
            onClick={() => {
              flushDrafts();
              pauseMockExam(deck.id);
            }}
          >
            <IconPause size={14} /> Pause
          </button>
        )}
        <button type="button" className="btn primary sm" onClick={() => setConfirm(true)}>
          Abgeben
        </button>
      </div>
      {paused && (
        <div className="panel mock-paused" role="status">
          <Mascot who="pip" mood="wave" size={84} side="top" />
          <b>Prüfung pausiert</b>
          <p className="muted">
            Die Uhr steht still – es bleiben {fmtClock(left)}. Die Aufgaben sind so lange ausgeblendet, damit es fair bleibt wie in einer
            echten Prüfung.
          </p>
          <p className="mock-pause-clock">Pause seit {fmtClock(now - ex.pausedAt!)}</p>
          <button type="button" className="btn primary" onClick={() => resumeMockExam(deck.id)}>
            <IconPlay size={14} /> Weiterschreiben
          </button>
        </div>
      )}
      {!paused && <h2 className="mock-title">{ex.title}</h2>}
      {!paused && ex.questions.map((q, i) => (
        <section key={q.id} className="panel mock-q">
          <header>
            <b>Aufgabe {i + 1}</b>
            <small className="muted">
              {TYPE_LABEL[q.type]} · {pts(q.points)} {q.points === 1 ? 'Punkt' : 'Punkte'}
            </small>
          </header>
          <p className="mock-question">{q.question}</p>
          {q.type === 'mc' ? (
            <div className="options">
              {q.options!.map((o, k) => (
                <button
                  key={k}
                  type="button"
                  className={`option ${ex.answers[q.id] === k ? 'picked' : ''}`}
                  aria-pressed={ex.answers[q.id] === k}
                  onClick={() => setMockAnswer(deck.id, q.id, k)}
                >
                  <span className="opt-letter">{'ABCD'[k] ?? k + 1}</span>
                  {o}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              className="input mock-answer"
              rows={q.type === 'open' ? 9 : 3}
              value={value(q.id)}
              placeholder={q.type === 'open' ? 'Deine ausführliche Antwort …' : 'Deine Antwort …'}
              onChange={(e) => write(q.id, e.target.value)}
              onBlur={flushDrafts}
              aria-label={`Antwort zu Aufgabe ${i + 1}`}
            />
          )}
        </section>
      ))}
      <div className="row-gap end" style={paused ? { display: 'none' } : undefined}>
        <button type="button" className="btn primary" onClick={() => setConfirm(true)}>
          Prüfung abgeben
        </button>
      </div>
      {confirm && (
        <ConfirmModal
          title="Prüfung abgeben?"
          text={
            answered < ex.questions.length
              ? `${ex.questions.length - answered === 1 ? 'Eine Aufgabe ist' : `${ex.questions.length - answered} Aufgaben sind`} noch unbeantwortet. Nach dem Abgeben kannst du nichts mehr ändern.`
              : 'Nach dem Abgeben kannst du nichts mehr ändern. Die KI wertet deine Antworten danach aus.'
          }
          confirm="Abgeben"
          onClose={() => setConfirm(false)}
          onConfirm={submit}
        />
      )}
    </div>
  );
}

function Result({ deck, ex, onNew }: { deck: Deck; ex: MockExam; onNew: () => void }) {
  const r = ex.result!;
  const [again, setAgain] = useState(false);
  const [, setParams] = useSearchParams();
  const [learned, setLearned] = useState<{ added: number; moved: number } | null>(null);
  const [sharing, setSharing] = useState(false);
  const f = ex.friend;
  const vs = f?.percent !== undefined ? compareResult(r.percent, f.percent) : null;
  const mistakes = mistakeCards(ex).length;
  const toLearn = () => setParams({ tab: 'learn' });
  return (
    <div className="mock-result">
      <div className="panel mock-score">
        {r.passed && r.percent >= 80 && <Confetti />}
        <Mascot who="pip" mood={r.percent >= 80 ? 'cheer' : r.passed ? 'happy' : 'sad'} size={88} side="top" />
        <small className="muted">{ex.title}</small>
        <div className={`mock-grade ${r.passed ? 'pass' : 'fail'}`}>
          {ex.scale !== 'pct' && <span>Note</span>}
          <b>{r.grade}</b>
        </div>
        <p>
          <b>
            {pts(r.total)} von {pts(r.max)} Punkten
          </b>{' '}
          ({r.percent} %) · {r.passed ? 'bestanden' : 'nicht bestanden'}
          {(ex.pauses ?? 0) > 0 && (
            <span className="muted">
              {' '}
              · {ex.pauses} {ex.pauses === 1 ? 'Pause' : 'Pausen'} ({Math.round((ex.pausedMs ?? 0) / 60_000)} Min.)
            </span>
          )}
        </p>
        {f && vs && (
          <div className={`mock-vs ${vs}`}>
            <div>
              <small>Du</small>
              <b>{ex.scale === 'pct' ? `${r.percent} %` : r.grade}</b>
              <small>{r.percent} %</small>
            </div>
            <span>{vs === 'better' ? '>' : vs === 'worse' ? '<' : '='}</span>
            <div>
              <small>{f.name}</small>
              <b>{f.scale === 'pct' || f.scale !== ex.scale ? `${f.percent} %` : f.grade}</b>
              <small>{f.percent} %</small>
            </div>
            <p>
              {vs === 'better'
                ? `Du hast ${f.name} geschlagen! 🎉`
                : vs === 'worse'
                  ? `${f.name} liegt noch vorn – schau dir die Fehler an und versuch es nochmal.`
                  : 'Unentschieden – ihr seid gleich gut!'}
            </p>
          </div>
        )}
        {r.summary && <p className="muted">{r.summary}</p>}
        <div className="mock-lists">
          {r.strengths.length > 0 && (
            <div>
              <h3>Das kannst du</h3>
              <ul>
                {r.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {r.improve.length > 0 && (
            <div>
              <h3>Das solltest du wiederholen</h3>
              <ul>
                {r.improve.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="row-gap center">
          <button type="button" className="btn outline" onClick={() => setAgain(true)}>
            <IconRefresh size={16} /> Gleiche Prüfung nochmal
          </button>
          <button type="button" className="btn outline" onClick={() => setSharing(true)}>
            <IconHeart size={16} /> Mit Freunden teilen
          </button>
          <button type="button" className="btn primary" onClick={onNew}>
            <IconSparkle size={16} /> Neue Probeprüfung
          </button>
        </div>
      </div>
      {sharing && <ShareDialog deck={deck} onClose={() => setSharing(false)} />}

      {mistakes > 0 && (
        <div className="panel mock-mistakes">
          <div>
            <b>Aus den Fehlern lernen</b>
            {ex.mistakesLearned ? (
              <p className="muted">
                {learned
                  ? `${learned.added} neue Karten aus deinen Fehlern${learned.moved ? ` und ${learned.moved} passende Karten` : ''} sind jetzt fällig – mit dem Schlagwort „Probeprüfung“.`
                  : 'Die Karten aus deinen Fehlern sind im Deck (Schlagwort „Probeprüfung“).'}
              </p>
            ) : (
              <p className="muted">
                Aus {mistakes === 1 ? 'der Aufgabe' : `den ${mistakes} Aufgaben`} mit Punktabzug werden Karten mit der Musterlösung – sofort fällig, ohne
                das Tageslimit für neue Karten. Passende Karten, die du schon hast, kommen heute ebenfalls dran.
              </p>
            )}
          </div>
          {ex.mistakesLearned ? (
            <button type="button" className="btn primary" onClick={toLearn}>
              Jetzt lernen
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => setLearned(learnFromMistakes(deck.id))}>
              <IconPlus size={16} /> {mistakes === 1 ? '1 Karte' : `${mistakes} Karten`} erstellen
            </button>
          )}
        </div>
      )}

      <h2>Korrektur</h2>
      {ex.questions.map((q, i) => {
        const g = r.perQuestion[q.id] ?? { points: 0, feedback: '' };
        const a = ex.answers[q.id];
        const state = g.points >= q.points ? 'ok' : g.points > 0 ? 'part' : 'bad';
        return (
          <section key={q.id} className={`panel mock-q graded ${state}`}>
            <header>
              <span className="qr-icon">{state === 'bad' ? <IconClose size={15} /> : <IconCheck size={15} />}</span>
              <b>Aufgabe {i + 1}</b>
              <span className="mock-pts">
                {pts(g.points)} / {pts(q.points)} P.
              </span>
            </header>
            <p className="mock-question">{q.question}</p>
            {q.type === 'mc' ? (
              <ul className="mock-mc">
                {q.options!.map((o, k) => (
                  <li key={k} className={k === q.answer ? 'right' : k === a ? 'wrong' : ''}>
                    <span className="opt-letter">{'ABCD'[k]}</span> {o}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <h4>Deine Antwort</h4>
                <p className="mock-given">{String(a ?? '').trim() || <i className="muted">keine Antwort</i>}</p>
                <h4>Musterlösung</h4>
                <p className="mock-solution">{q.solution}</p>
              </>
            )}
            {g.feedback && <p className="mock-feedback">{g.feedback}</p>}
          </section>
        );
      })}
      <History deck={deck} />
      {again && (
        <ConfirmModal
          title="Prüfung nochmal schreiben?"
          text="Deine Antworten werden gelöscht und die Zeit startet neu. Das Ergebnis bleibt im Verlauf."
          confirm="Neu starten"
          onClose={() => setAgain(false)}
          onConfirm={() => startMockExam(deck.id)}
        />
      )}
    </div>
  );
}

function History({ deck }: { deck: Deck }) {
  const h = deck.mockHistory ?? [];
  if (!h.length) return null;
  return (
    <section className="panel mock-history">
      <div className="panel-head">
        <h2>Bisherige Probeprüfungen</h2>
        {deck.mockExam?.status === 'graded' && (
          <button type="button" className="link-btn" onClick={() => discardMockExam(deck.id)}>
            Korrektur ausblenden
          </button>
        )}
      </div>
      <ul>
        {[...h].reverse().map((x) => (
          <li key={x.at}>
            <span>
              {new Date(x.at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })} · {x.title}
              <small className="muted"> · {levelLabel(x.level)}</small>
            </span>
            <b className={x.passed ? 'pass' : 'fail'}>
              {x.scale === 'pct' ? `${x.percent} %` : `${x.grade} (${x.percent} %)`}
            </b>
          </li>
        ))}
      </ul>
    </section>
  );
}
