import { useEffect, useState } from 'react';
import { CostHint } from '../../components/CostHint';
import { estimate } from '../../lib/costs';
import { materialFrom } from '../../lib/ai';
import { IconCheck, IconClose, IconRefresh, IconSparkle } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { Confetti, Mascot } from '../../components/Mascot';
import { NoKeyNotice } from '../../components/NoKey';
import { startJob } from '../../lib/jobs';
import { type Deck } from '../../lib/store';
import { useAiReady } from './SummaryTab';

export default function QuizTab({ deck }: { deck: Deck }) {
  const [count, setCount] = useState(8);
  const job = useJob(deck.id, 'quiz');
  const busy = isActive(job);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [index, setIndex] = useState(0);
  const ready = useAiReady();
  const quiz = deck.quiz;
  const hasMaterial = deck.source.trim() || deck.cards.length;

  // A new quiz arrived (from the background) – start at question 1.
  useEffect(() => {
    setAnswers({});
    setIndex(0);
  }, [quiz]);

  const run = () => {
    startJob('quiz', deck, { count });
  };
  const error = '';

  const status = (
    <>
      {busy && job && <JobBanner job={job} />}
      <JobError job={job} />
    </>
  );

  const setup = (
    <div>
    {status}
    <div className="empty">
      <b>{quiz ? 'Neues Quiz' : 'Teste dein Wissen'}</b>
      <p className="muted">Die KI stellt dir prüfungsähnliche Multiple-Choice-Fragen zu diesem Deck.</p>
      {!ready ? (
        <NoKeyNotice compact />
      ) : (
        <>
          <label className="field-label" htmlFor="quiz-count">
            Anzahl Fragen: {count}
          </label>
          <input id="quiz-count" type="range" min={3} max={20} value={count} onChange={(e) => setCount(+e.target.value)} />
          <button type="button" className="btn primary" onClick={run} disabled={busy || !hasMaterial}>
            <IconSparkle size={16} /> {busy ? 'Fragen werden erstellt …' : 'Quiz erstellen'}
          </button>
          {hasMaterial && <CostHint est={estimate.quiz(materialFrom(deck.source, deck.cards).length, count)} />}
        </>
      )}
      {!hasMaterial && <p className="muted small">Füge zuerst Lernmaterial oder Karten hinzu.</p>}
    </div>
    </div>
  );

  if (!quiz || !quiz.length) return setup;

  const finished = index >= quiz.length;
  if (finished) {
    const right = quiz.filter((q, i) => answers[i] === q.answer).length;
    return (
      <div className="quiz">
        {status}
        <div className="empty">
          {right / quiz.length >= 0.8 && <Confetti />}
          <Mascot
            who="pip"
            mood={right / quiz.length >= 0.8 ? 'cheer' : right / quiz.length >= 0.5 ? 'happy' : 'sad'}
            size={96}
            side="top"
          />
          <b>
            {right} von {quiz.length} richtig
          </b>
          <p className="muted">{right / quiz.length >= 0.8 ? 'Super gemacht!' : right / quiz.length >= 0.5 ? 'Gut – schau dir die Fehler noch mal an.' : 'Übung macht den Meister. Wiederhole die Karten und versuch es nochmal.'}</p>
          <div className="row-gap center">
            <button
              type="button"
              className="btn outline"
              onClick={() => {
                setAnswers({});
                setIndex(0);
              }}
            >
              <IconRefresh size={16} /> Nochmal versuchen
            </button>
            {ready && (
              <button type="button" className="btn primary" onClick={run} disabled={busy}>
                <IconSparkle size={16} /> {busy ? 'Fragen werden erstellt …' : 'Neue Fragen'}
              </button>
            )}
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="quiz-review">
          {quiz.map((q, i) => (
            <div key={i} className={`quiz-rev ${answers[i] === q.answer ? 'ok' : 'bad'}`}>
              <span className="qr-icon">{answers[i] === q.answer ? <IconCheck size={16} /> : <IconClose size={16} />}</span>
              <div>
                <b>{q.question}</b>
                <p>
                  Richtig: {q.options[q.answer]}
                  {answers[i] !== q.answer && answers[i] !== undefined && <span className="muted"> · Deine Antwort: {q.options[answers[i]]}</span>}
                </p>
                {q.explanation && <small className="muted">{q.explanation}</small>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const q = quiz[index];
  const picked = answers[index];
  return (
    <div className="quiz">
      {status}
      <div className="learn-progress">
        <span>
          Frage {index + 1} / {quiz.length}
        </span>
        <span className="bar">
          <i style={{ width: `${(index / quiz.length) * 100}%` }} />
        </span>
      </div>
      <div className="panel quiz-card">
        <h3>{q.question}</h3>
        <div className="options">
          {q.options.map((o, k) => {
            const state = picked === undefined ? '' : k === q.answer ? 'right' : k === picked ? 'wrong' : 'dim';
            return (
              <button
                type="button"
                key={k}
                className={`option ${state}`}
                disabled={picked !== undefined}
                onClick={() => setAnswers({ ...answers, [index]: k })}
              >
                <span className="opt-letter">{'ABCD'[k] ?? k + 1}</span>
                {o}
              </button>
            );
          })}
        </div>
        {picked !== undefined && (
          <div className={`grade ${picked === q.answer ? 'g4' : 'g1'}`}>
            <b>{picked === q.answer ? 'Richtig!' : 'Leider falsch'}</b>
            {q.explanation && <p>{q.explanation}</p>}
          </div>
        )}
        <div className="row-gap end">
          <button type="button" className="btn primary" disabled={picked === undefined} onClick={() => setIndex(index + 1)}>
            {index + 1 < quiz.length ? 'Nächste Frage' : 'Ergebnis ansehen'}
          </button>
        </div>
      </div>
    </div>
  );
}
