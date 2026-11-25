import { useCallback, useEffect, useMemo, useState } from 'react';
import { playUi } from '../../lib/uiSound';
import { CostHint } from '../../components/CostHint';
import { estimate } from '../../lib/costs';
import { materialFrom } from '../../lib/ai';
import { buildOfflineQuiz } from '../../lib/appExtras';
import { IconCheck, IconClose, IconPlay, IconRefresh, IconSparkle } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { Confetti, Mascot } from '../../components/Mascot';
import { NoKeyNotice } from '../../components/NoKey';
import { startJob } from '../../lib/jobs';
import type { Deck, QuizQuestion } from '../../lib/store';
import { useAiReady } from './SummaryTab';

export default function QuizTab({ deck }: { deck: Deck }) {
  const [count, setCount] = useState(8);
  const job = useJob(deck.id, 'quiz');
  const busy = isActive(job);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [index, setIndex] = useState(0);
  // Local override for offline card-based quiz or "retry wrong questions" rounds
  const [localQuiz, setLocalQuiz] = useState<{ label: string; items: QuizQuestion[] } | null>(null);
  const ready = useAiReady();
  const aiQuiz = deck.quiz;
  const activeQuiz = localQuiz ? localQuiz.items : aiQuiz;
  const hasMaterial = deck.source.trim() || deck.cards.length;
  const offlineReady = useMemo(() => buildOfflineQuiz(deck.cards, 4, 1).length >= 4, [deck.cards]);

  // A new AI quiz arrived (from the background) – switch to it and start at question 1.
  useEffect(() => {
    setLocalQuiz(null);
    setAnswers({});
    setIndex(0);
  }, [aiQuiz]);

  const runAi = () => {
    startJob('quiz', deck, { count });
  };

  const startOffline = () => {
    const items = buildOfflineQuiz(deck.cards, count, Date.now());
    if (!items.length) return;
    setLocalQuiz({ label: 'Sofort-Quiz aus deinen Karten', items });
    setAnswers({});
    setIndex(0);
  };

  const finished = !!activeQuiz && activeQuiz.length > 0 && index >= activeQuiz.length;
  const currentQ = activeQuiz && !finished ? activeQuiz[index] : undefined;
  const picked = currentQ ? answers[index] : undefined;

  const choose = useCallback(
    (k: number) => {
      if (!currentQ || picked !== undefined || k < 0 || k >= currentQ.options.length) return;
      playUi(k === currentQ.answer ? 'right' : 'wrong');
      setAnswers((prev) => ({ ...prev, [index]: k }));
    },
    [currentQ, picked, index],
  );

  // Keyboard shortcuts: 1-4 / A-D to answer, Enter / Space for next question
  useEffect(() => {
    if (!currentQ) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const lower = e.key.toLowerCase();
      if (picked === undefined) {
        if (['1', '2', '3', '4'].includes(lower)) {
          e.preventDefault();
          choose(Number(lower) - 1);
        } else if (['a', 'b', 'c', 'd'].includes(lower)) {
          e.preventDefault();
          choose(lower.charCodeAt(0) - 97);
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIndex((i) => i + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentQ, picked, choose]);

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
        <b>{activeQuiz ? 'Neues Quiz' : 'Teste dein Wissen'}</b>
        <p className="muted">Starte sofort ein kostenloses Multiple-Choice-Quiz aus deinen Karten – oder lass die KI prüfungsähnliche Fragen erstellen.</p>
        <label className="field-label" htmlFor="quiz-count">
          Anzahl Fragen: {count}
        </label>
        <input id="quiz-count" type="range" min={3} max={20} value={count} onChange={(e) => setCount(+e.target.value)} />
        <div className="row-gap center" style={{ flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" className="btn primary" onClick={startOffline} disabled={!offlineReady} title={offlineReady ? 'Sofort ohne KI aus den Karteikarten erstellen' : 'Benötigt mindestens 4 aktive Karten mit verschiedenen Antworten'}>
            <IconPlay size={15} /> Sofort-Quiz aus Karten
          </button>
          {ready && (
            <button type="button" className="btn outline" onClick={runAi} disabled={busy || !hasMaterial}>
              <IconSparkle size={16} /> {busy ? 'KI-Fragen werden erstellt …' : 'KI-Quiz erstellen'}
            </button>
          )}
        </div>
        {!offlineReady && <p className="muted small">Für das Offline-Quiz werden mindestens 4 aktive Karten mit unterschiedlichen Antworten benötigt.</p>}
        {ready && hasMaterial && <CostHint est={estimate.quiz(materialFrom(deck.source, deck.cards).length, count)} />}
        {!ready && !offlineReady && <NoKeyNotice compact />}
      </div>
    </div>
  );

  if (!activeQuiz || !activeQuiz.length) return setup;

  if (finished) {
    const right = activeQuiz.filter((q, i) => answers[i] === q.answer).length;
    const wrongQuestions = activeQuiz.filter((q, i) => answers[i] !== q.answer);
    return (
      <div className="quiz">
        {status}
        <div className="empty">
          {right / activeQuiz.length >= 0.8 && <Confetti />}
          <Mascot
            who="pip"
            mood={right / activeQuiz.length >= 0.8 ? 'cheer' : right / activeQuiz.length >= 0.5 ? 'happy' : 'sad'}
            size={96}
            side="top"
          />
          <b>
            {right} von {activeQuiz.length} richtig
          </b>
          <p className="muted">
            {right / activeQuiz.length >= 0.8
              ? 'Super gemacht!'
              : right / activeQuiz.length >= 0.5
                ? 'Gut – schau dir die Fehler noch mal an.'
                : 'Übung macht den Meister. Wiederhole die Karten und versuch es nochmal.'}
          </p>
          <div className="row-gap center" style={{ flexWrap: 'wrap' }}>
            {wrongQuestions.length > 0 && (
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setLocalQuiz({ label: `Wiederholung (${wrongQuestions.length} Fehler)`, items: wrongQuestions });
                  setAnswers({});
                  setIndex(0);
                }}
              >
                <IconRefresh size={16} /> Nur falsche wiederholen ({wrongQuestions.length})
              </button>
            )}
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
            {offlineReady && (
              <button type="button" className="btn outline" onClick={startOffline}>
                <IconPlay size={15} /> Neues Sofort-Quiz
              </button>
            )}
            {ready && (
              <button type="button" className="btn outline" onClick={runAi} disabled={busy}>
                <IconSparkle size={16} /> {busy ? 'Fragen werden erstellt …' : 'Neue KI-Fragen'}
              </button>
            )}
          </div>
        </div>
        <div className="quiz-review">
          {activeQuiz.map((q, i) => (
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

  const q = currentQ!;
  return (
    <div className="quiz">
      {status}
      <div className="learn-progress">
        <span>
          Frage {index + 1} / {activeQuiz.length}
          {localQuiz && <small className="muted"> · {localQuiz.label}</small>}
        </span>
        <span className="bar">
          <i style={{ width: `${(index / activeQuiz.length) * 100}%` }} />
        </span>
        <div className="row-gap">
          {offlineReady && (
            <button type="button" className="btn ghost sm" onClick={startOffline} title="Neues Sofort-Quiz aus Karten mischen">
              <IconRefresh size={13} /> Neu mischen
            </button>
          )}
        </div>
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
                onClick={() => choose(k)}
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
        <div className="row-gap between" style={{ marginTop: 12 }}>
          <small className="muted">Tasten: 1–4 / A–D wählen · Enter weiter</small>
          <button type="button" className="btn primary" disabled={picked === undefined} onClick={() => setIndex(index + 1)}>
            {index + 1 < activeQuiz.length ? 'Nächste Frage' : 'Ergebnis ansehen'}
          </button>
        </div>
      </div>
    </div>
  );
}
