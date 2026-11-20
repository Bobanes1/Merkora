import { useEffect, useState } from 'react';
import { CardContent } from '../../components/CardContent';
import { CodeEditor } from '../../components/CodeEditor';
import { CostHint } from '../../components/CostHint';
import { IconCheck, IconClose, IconPlay, IconPlus, IconSparkle, IconTrash } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { Lab, LAB_DEFAULTS, LAB_TITLES } from '../../components/labs/Labs';
import { NoKeyNotice } from '../../components/NoKey';
import { gradeAnswer, materialFrom } from '../../lib/ai';
import { estimate } from '../../lib/costs';
import { openExternal } from '../../lib/desktop';
import { buildHarness, harnessOffset, localJava, mapErrors, parseResults, runJavaLocal, runJavaOnline, type RunResult, type TestResult } from '../../lib/javaRun';
import { startJob } from '../../lib/jobs';
import { checkAnswer, problemCount, solvedCount, type JavaProblem, type LabSpec, type MathProblem, type PracticeKind, type PracticeSet, type ProblemProgress } from '../../lib/practice';
import { addCards, setSettings, updateDeck, useStore, type Deck } from '../../lib/store';
import { useAiReady } from './SummaryTab';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** „Aufgaben“: practice sets made by the AI (math with hints, Java with tests) and interactive labs. */
export default function PracticeTab({ deck }: { deck: Deck }) {
  const job = useJob(deck.id, 'practice');
  const busy = isActive(job);
  const ready = useAiReady();
  const [type, setType] = useState<PracticeKind>('auto');
  const [count, setCount] = useState(8);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lab, setLab] = useState<LabSpec | null>(null);
  const sets = deck.practice ?? [];
  const open = sets.find((s) => s.id === openId);
  const hasMaterial = deck.source.trim() || deck.cards.length;

  // a new set arrived from the background: open it
  const newest = sets[0]?.id;
  const [seen, setSeen] = useState(newest);
  useEffect(() => {
    if (newest && newest !== seen) {
      setSeen(newest);
      setOpenId(newest);
    }
  }, [newest, seen]);

  if (open) return <SetView deck={deck} set={open} onBack={() => setOpenId(null)} />;
  if (lab)
    return (
      <div className="practice">
        <button type="button" className="btn ghost sm" onClick={() => setLab(null)}>
          ‹ Zurück zu den Aufgaben
        </button>
        <Lab spec={lab} />
      </div>
    );

  return (
    <div className="practice">
      {busy && job && <JobBanner job={job} />}
      <JobError job={job} />
      <section className="panel practice-new">
        <h2>Aufgaben üben</h2>
        <p className="muted">
          Die KI stellt aus deinem Material Aufgaben zusammen – mit Erklärung, Beispiel und Hinweisen Schritt für Schritt. Mathe-Ergebnisse prüft Merkora
          selbst, Java-Code wird mit Tests ausgeführt.
        </p>
        {!ready ? (
          <NoKeyNotice compact />
        ) : (
          <>
            <div className="seg" role="radiogroup" aria-label="Art der Aufgaben">
              {(
                [
                  ['auto', 'Automatisch'],
                  ['math', 'Mathe'],
                  ['java', 'Programmieren (Java)'],
                ] as const
              ).map(([id, l]) => (
                <button key={id} type="button" role="radio" aria-checked={type === id} className={type === id ? 'on' : ''} onClick={() => setType(id)}>
                  {l}
                </button>
              ))}
            </div>
            <label className="field-label" htmlFor="practice-count">
              Anzahl Aufgaben: {count}
            </label>
            <input id="practice-count" type="range" min={4} max={15} value={count} onChange={(e) => setCount(+e.target.value)} />
            <div className="row-gap">
              <button type="button" className="btn primary" disabled={busy || !hasMaterial} onClick={() => startJob('practice', deck, { count, type })}>
                <IconSparkle size={16} /> {busy ? 'Aufgaben werden erstellt …' : 'Aufgaben erstellen'}
              </button>
            </div>
            {!hasMaterial && <p className="muted small">Lade zuerst Material hoch oder erstelle Karten.</p>}
            {hasMaterial && <CostHint est={{ input: 900 + Math.ceil(materialFrom(deck.source, deck.cards).length / 3.5), output: count * (type === 'java' ? 600 : 400) }} />}
          </>
        )}
      </section>

      {sets.length > 0 && (
        <section className="panel">
          <h2>Deine Aufgaben</h2>
          <ul className="practice-list">
            {sets.map((s) => {
              const n = problemCount(s), done = solvedCount(s);
              return (
                <li key={s.id}>
                  <button type="button" className="practice-item" onClick={() => setOpenId(s.id)}>
                    <span className={'badge ' + s.kind}>{s.kind === 'java' ? 'Java' : 'Mathe'}</span>
                    <span className="grow">
                      <b>{s.topic}</b>
                      <small className="muted">
                        {done} von {n} gelöst · {new Date(s.createdAt).toLocaleDateString('de-DE')}
                        {s.labs.length ? ` · ${s.labs.length} ${s.labs.length === 1 ? 'Labor' : 'Labore'}` : ''}
                      </small>
                    </span>
                    <span className="bar practice-bar" aria-hidden="true">
                      <i style={{ width: `${(done / Math.max(1, n)) * 100}%` }} />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Aufgaben löschen"
                    title="Löschen"
                    onClick={() => updateDeck(deck.id, (d) => ({ practice: (d.practice ?? []).filter((x) => x.id !== s.id) }))}
                  >
                    <IconTrash size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Labore zum Ausprobieren</h2>
        <p className="muted small">Mathe zum Anfassen: Werte verschieben und sehen, was passiert.</p>
        <div className="lab-grid-list">
          {LAB_DEFAULTS.map((l) => (
            <button key={l.type} type="button" className="btn outline sm" onClick={() => setLab(l)}>
              {LAB_TITLES[l.type]}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Saves the progress of one task. */
function saveProgress(deck: Deck, set: PracticeSet, i: number, patch: Partial<ProblemProgress>) {
  updateDeck(deck.id, (d) => ({
    practice: (d.practice ?? []).map((s) => (s.id === set.id ? { ...s, progress: s.progress.map((p, k) => (k === i ? { ...p, ...patch } : p)) } : s)),
  }));
}

function SetView({ deck, set, onBack }: { deck: Deck; set: PracticeSet; onBack: () => void }) {
  const n = problemCount(set);
  const firstOpen = set.progress.findIndex((p) => !p.solved);
  const [i, setI] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [steps, setSteps] = useState(0);
  const done = solvedCount(set);
  return (
    <div className="practice">
      <button type="button" className="btn ghost sm" onClick={onBack}>
        ‹ Alle Aufgaben
      </button>
      <section className="panel">
        <span className={'badge ' + set.kind}>{set.kind === 'java' ? 'Java' : 'Mathe'}</span>
        <h2>{set.topic}</h2>
        {set.intro && <CardContent text={set.intro} className="practice-intro" />}
        {set.example && (
          <div className="practice-example">
            <b>Beispiel</b>
            <CardContent text={set.example.problem} />
            {set.example.code && <pre className="code" dangerouslySetInnerHTML={{ __html: esc(set.example.code) }} />}
            {set.example.steps.slice(0, steps).map((s, k) => (
              <div key={k} className="practice-step">
                <span>{k + 1}</span>
                <CardContent text={s} />
              </div>
            ))}
            {steps < set.example.steps.length ? (
              <button type="button" className="btn outline sm" onClick={() => setSteps((x) => x + 1)}>
                {steps ? 'Nächster Schritt' : 'Lösungsweg zeigen'} ({steps}/{set.example.steps.length})
              </button>
            ) : (
              set.example.answer && (
                <p>
                  <b>Ergebnis:</b> <CardContent text={set.example.answer} className="inline" />
                </p>
              )
            )}
          </div>
        )}
      </section>
      {set.labs.map((l, k) => (
        <Lab key={k} spec={l} />
      ))}
      <section className="panel">
        <div className="practice-nav" role="tablist" aria-label="Aufgaben">
          {Array.from({ length: n }, (_, k) => (
            <button key={k} type="button" role="tab" aria-selected={k === i} className={(k === i ? 'on ' : '') + (set.progress[k]?.solved ? 'done' : '')} onClick={() => setI(k)}>
              {set.progress[k]?.solved ? <IconCheck size={13} /> : k + 1}
            </button>
          ))}
          <span className="muted small grow right">
            {done} von {n} gelöst
          </span>
        </div>
        {set.kind === 'math' && set.math?.[i] && <MathTask key={set.id + i} deck={deck} set={set} i={i} p={set.math[i]} onNext={() => setI((x) => Math.min(n - 1, x + 1))} />}
        {set.kind === 'java' && set.java?.[i] && <JavaTask key={set.id + i} deck={deck} set={set} i={i} p={set.java[i]} onNext={() => setI((x) => Math.min(n - 1, x + 1))} />}
        {done === n && <p className="form-ok">Alle Aufgaben gelöst – stark! Erstelle neue Aufgaben oder übe mit den Laboren weiter.</p>}
      </section>
    </div>
  );
}

function Hints({ hints, used, onMore }: { hints: string[]; used: number; onMore: () => void }) {
  if (!hints.length) return null;
  return (
    <div className="practice-hints">
      {hints.slice(0, used).map((h, k) => (
        <div key={k} className="practice-hint">
          <b>Hinweis {k + 1}:</b> <CardContent text={h} className="inline" />
        </div>
      ))}
      {used < hints.length && (
        <button type="button" className="btn ghost sm" onClick={onMore}>
          💡 {used ? 'Noch ein Hinweis' : 'Hinweis'} ({used}/{hints.length})
        </button>
      )}
    </div>
  );
}

function MathTask({ deck, set, i, p, onNext }: { deck: Deck; set: PracticeSet; i: number; p: MathProblem; onNext: () => void }) {
  const prog = set.progress[i] ?? { tries: 0, hints: 0 };
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'right' | 'wrong' | 'invalid' | null>(prog.solved ? 'right' : null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSteps, setShowSteps] = useState(!!prog.shown);
  const [saved, setSaved] = useState(false);

  const check = async (value = input) => {
    let r = checkAnswer(p.answer, value);
    setFeedback('');
    if (r === 'ai') {
      setBusy(true);
      try {
        const g = await gradeAnswer(p.problem, p.answer.value, value);
        r = g.score >= 3 ? 'right' : 'wrong';
        setFeedback(g.feedback);
      } catch (e) {
        setFeedback((e as Error).message);
        r = 'invalid';
      } finally {
        setBusy(false);
      }
    }
    if (r === 'invalid' && p.answer.type !== 'text') {
      setResult('invalid');
      return;
    }
    setResult(r as 'right' | 'wrong');
    saveProgress(deck, set, i, { tries: prog.tries + 1, ...(r === 'right' ? { solved: true } : {}) });
  };

  const saveCard = () => {
    const back = `${p.answer.type === 'choice' ? p.answer.value : p.answer.value}${p.steps.length ? '\n\nLösungsweg:\n' + p.steps.map((s, k) => `${k + 1}. ${s}`).join('\n') : ''}`;
    addCards(deck.id, [{ front: p.problem, back }]);
    setSaved(true);
  };

  return (
    <div className="practice-task">
      <CardContent text={p.problem} className="practice-problem" />
      {p.answer.type === 'choice' ? (
        <div className="practice-choices">
          {p.answer.options!.map((o) => (
            <button key={o} type="button" className="btn outline" onClick={() => (setInput(o), void check(o))} disabled={busy}>
              <CardContent text={o} className="inline" />
            </button>
          ))}
        </div>
      ) : (
        <div className="input-row">
          {p.answer.type === 'text' ? (
            <textarea className="input" rows={3} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Deine Antwort" />
          ) : (
            <input
              className="input"
              value={input}
              onChange={(e) => (setInput(e.target.value), setResult(null))}
              onKeyDown={(e) => e.key === 'Enter' && void check()}
              placeholder={p.answer.type === 'expr' ? 'Formel in x, z. B. 2*x+3' : p.answer.type === 'fraction' ? 'z. B. 3/8 oder 0,375' : 'Zahl, z. B. 0,27 oder 27 %'}
              inputMode={p.answer.type === 'expr' ? 'text' : 'decimal'}
            />
          )}
          <button type="button" className="btn primary" onClick={() => void check()} disabled={busy || !input.trim()}>
            {busy ? 'Wird geprüft …' : 'Prüfen'}
          </button>
        </div>
      )}
      {p.answer.type === 'expr' && input.trim() && <CardContent text={`Vorschau: \\( ${input.replace(/\*/g, ' \\cdot ')} \\)`} className="muted small" />}
      {result === 'right' && (
        <p className="form-ok">
          <IconCheck size={15} /> Richtig! {feedback}
        </p>
      )}
      {result === 'wrong' && (
        <p className="form-error">
          <IconClose size={15} /> Noch nicht. {feedback} {prog.tries >= 2 && prog.hints < p.hints.length ? 'Ein Hinweis hilft vielleicht.' : ''}
        </p>
      )}
      {result === 'invalid' && <p className="form-error">Diese Eingabe kann Merkora nicht lesen – {p.answer.type === 'expr' ? 'schreibe die Formel mit x, * und ^.' : 'gib eine Zahl ein.'}</p>}
      <Hints hints={p.hints} used={prog.hints} onMore={() => saveProgress(deck, set, i, { hints: prog.hints + 1 })} />
      <div className="row-gap">
        {(prog.tries >= 1 || result === 'right') && p.steps.length > 0 && (
          <button type="button" className="btn ghost sm" onClick={() => (setShowSteps(!showSteps), saveProgress(deck, set, i, { shown: true }))}>
            {showSteps ? 'Lösungsweg ausblenden' : 'Lösungsweg zeigen'}
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={saveCard} disabled={saved}>
          <IconPlus size={14} /> {saved ? 'Als Karte gespeichert' : 'Als Karte speichern'}
        </button>
        {result === 'right' && (
          <button type="button" className="btn outline sm" onClick={onNext}>
            Nächste Aufgabe ›
          </button>
        )}
      </div>
      {showSteps && (
        <ol className="practice-steps">
          {p.steps.map((s, k) => (
            <li key={k}>
              <CardContent text={s} />
            </li>
          ))}
          <li className="answer">
            <b>Ergebnis:</b> <CardContent text={p.answer.value} className="inline" />
          </li>
        </ol>
      )}
    </div>
  );
}

const draftKey = (set: PracticeSet, i: number) => `merkora.code.${set.id}.${i}`;
function loadDraft(set: PracticeSet, i: number, fallback: string) {
  try {
    return localStorage.getItem(draftKey(set, i)) ?? fallback;
  } catch {
    return fallback;
  }
}

function JavaTask({ deck, set, i, p, onNext }: { deck: Deck; set: PracticeSet; i: number; p: JavaProblem; onNext: () => void }) {
  const prog = set.progress[i] ?? { tries: 0, hints: 0 };
  const [code, setCode] = useState(() => loadDraft(set, i, p.starter));
  const [running, setRunning] = useState<'' | 'run' | 'test'>('');
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [out, setOut] = useState<{ text: string; error?: string; via?: RunResult['via'] } | null>(null);
  const [askOnline, setAskOnline] = useState<'run' | 'test' | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [saved, setSaved] = useState(false);
  const onlineOk = useStore((s) => !!s.data.settings.onlineCodeOk);
  const [java, setJava] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void localJava().then(setJava);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(set, i), code);
    } catch {
      /* no storage */
    }
  }, [code, set, i]);

  const exec = async (mode: 'run' | 'test', online: boolean) => {
    const tests = mode === 'test' ? p.tests : [];
    if (mode === 'run' && !/\bstatic\s+void\s+main\s*\(/.test(code)) {
      setOut({ text: '', error: 'Zum Ausführen braucht deine Klasse Solution eine Methode „public static void main(String[] args)“. Mit „Testen“ prüft Merkora deine Methoden direkt.' });
      return;
    }
    const src = buildHarness(code, tests);
    setRunning(mode);
    setOut(null);
    try {
      let r: RunResult | 'no-java' = online ? await runJavaOnline(src) : await runJavaLocal(src);
      if (r === 'no-java') {
        setJava(null);
        if (!onlineOk) {
          setAskOnline(mode);
          return;
        }
        r = await runJavaOnline(src);
      }
      const offset = harnessOffset(tests);
      if (r.compileError) {
        setResults(null);
        setOut({ text: '', error: 'Dein Code lässt sich nicht übersetzen:\n' + mapErrors(r.stderr, offset), via: r.via });
      } else if (r.timedOut) {
        setOut({ text: r.stdout, error: 'Das Programm hat zu lange gebraucht (Endlosschleife?) und wurde gestoppt.', via: r.via });
      } else if (mode === 'test') {
        const pr = parseResults(r.stdout, p.tests);
        setResults(pr.results);
        setOut({ text: pr.output, error: r.stderr.trim() ? mapErrors(r.stderr, offset) : undefined, via: r.via });
        const all = pr.results.every((x) => x.ok);
        saveProgress(deck, set, i, { tries: prog.tries + 1, ...(all ? { solved: true } : {}) });
      } else {
        setOut({ text: r.stdout, error: r.stderr.trim() ? mapErrors(r.stderr, offset) : undefined, via: r.via });
      }
    } catch (e) {
      setOut({ text: '', error: (e as Error).message });
    } finally {
      setRunning('');
    }
  };
  const go = (mode: 'run' | 'test') => {
    // on the phone (no Java there) the code goes online – only after asking once
    if (java === null && !onlineOk) {
      setAskOnline(mode);
      return;
    }
    void exec(mode, java === null);
  };

  const passed = results?.filter((r) => r.ok).length ?? 0;
  const saveCard = () => {
    addCards(deck.id, [{ front: `<b>${esc(p.title)}</b><br>${esc(p.task)}`, back: `<pre class="code"><code>${esc(p.solution || code)}</code></pre>`, html: true }]);
    setSaved(true);
  };

  return (
    <div className="practice-task">
      <h3>{p.title}</h3>
      <CardContent text={p.task} className="practice-problem" />
      <CodeEditor value={code} onChange={setCode} label={`Code für ${p.title}`} />
      <div className="row-gap">
        <button type="button" className="btn primary" onClick={() => go('test')} disabled={!!running}>
          <IconCheck size={15} /> {running === 'test' ? 'Wird getestet …' : `Testen (${p.tests.length})`}
        </button>
        <button type="button" className="btn outline" onClick={() => go('run')} disabled={!!running}>
          <IconPlay size={14} /> {running === 'run' ? 'Läuft …' : 'Ausführen'}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setCode(p.starter)} disabled={!!running}>
          Zurücksetzen
        </button>
        <span className="muted small">
          {java ? `Java ${java} auf diesem PC` : java === null ? (onlineOk ? 'läuft online (wandbox.org)' : 'kein Java auf diesem Gerät') : ''}
        </span>
      </div>
      {askOnline && (
        <div className="practice-consent">
          <p>
            <b>Code online ausführen?</b> Auf diesem Gerät gibt es kein Java. Merkora kann deinen Code an den kostenlosen Dienst <b>wandbox.org</b> schicken und
            dort ausführen – nur den Code, keine Lerndaten.
          </p>
          <div className="row-gap">
            <button type="button" className="btn primary sm" onClick={() => (setSettings({ onlineCodeOk: true }), setAskOnline(null), void exec(askOnline, true))}>
              Erlauben und ausführen
            </button>
            {java !== undefined && (
              <button type="button" className="btn outline sm" onClick={() => openExternal('https://adoptium.net/de/temurin/releases/')}>
                Java kostenlos installieren
              </button>
            )}
            <button type="button" className="btn ghost sm" onClick={() => setAskOnline(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {results && (
        <ul className="test-list">
          {results.map((r, k) => (
            <li key={k} className={r.ok ? 'ok' : 'bad'}>
              {r.ok ? <IconCheck size={14} /> : <IconClose size={14} />}
              <code>{p.tests[k].call}</code>
              {r.ok ? (
                <span className="muted"> = {p.tests[k].expected}</span>
              ) : r.got !== undefined ? (
                <span>
                  {' '}
                  erwartet <code>{p.tests[k].expected}</code>, erhalten <code>{r.got}</code>
                </span>
              ) : (
                <span> {r.error}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {results && (passed === results.length ? <p className="form-ok">Alle Tests bestanden!</p> : <p className="muted small">{passed} von {results.length} Tests bestanden.</p>)}
      {out && (out.text || out.error) && (
        <div className="code-output">
          {out.text && <pre>{out.text}</pre>}
          {out.error && <pre className="err">{out.error}</pre>}
          {out.via === 'online' && <small className="muted">ausgeführt bei wandbox.org</small>}
        </div>
      )}
      <Hints hints={p.hints} used={prog.hints} onMore={() => saveProgress(deck, set, i, { hints: prog.hints + 1 })} />
      <div className="row-gap">
        {(prog.tries >= 2 || prog.solved) && p.solution && (
          <button type="button" className="btn ghost sm" onClick={() => (setShowSolution(!showSolution), saveProgress(deck, set, i, { shown: true }))}>
            {showSolution ? 'Lösung ausblenden' : 'Lösung zeigen'}
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={saveCard} disabled={saved}>
          <IconPlus size={14} /> {saved ? 'Als Karte gespeichert' : 'Als Karte speichern'}
        </button>
        {prog.solved && (
          <button type="button" className="btn outline sm" onClick={onNext}>
            Nächste Aufgabe ›
          </button>
        )}
      </div>
      {showSolution && <pre className="code" dangerouslySetInnerHTML={{ __html: esc(p.solution) }} />}
    </div>
  );
}
