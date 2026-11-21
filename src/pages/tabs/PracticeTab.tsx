import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CostHint } from '../../components/CostHint';
import { IconSparkle, IconTrash } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { NoKeyNotice } from '../../components/NoKey';
import { PracticeSetView, type SetHost } from '../../components/practice/PracticeSetView';
import { materialFrom } from '../../lib/ai';
import { startJob } from '../../lib/jobs';
import { DOMAIN_LABEL, problemCount, solvedCount, type PracticeKind, type PracticeSet } from '../../lib/practice';
import { addCards, updateDeck, type Deck } from '../../lib/store';
import { useAiReady } from './SummaryTab';

const KINDS: [PracticeKind, string][] = [
  ['auto', 'Automatisch'],
  ['math', 'Mathe'],
  ['java', 'Programmieren'],
  ['law', 'Recht'],
  ['music', 'Musik'],
  ['language', 'Sprache'],
];

/** „Aufgaben“ of a deck: practice sets from the deck's material (the same engine as „Skills“). */
export default function PracticeTab({ deck }: { deck: Deck }) {
  const job = useJob(deck.id, 'practice');
  const busy = isActive(job);
  const ready = useAiReady();
  const [type, setType] = useState<PracticeKind>('auto');
  const [count, setCount] = useState(8);
  const [openId, setOpenId] = useState<string | null>(null);
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

  if (open) {
    const host: SetHost = {
      progress: (i, patch) =>
        updateDeck(deck.id, (d) => ({ practice: (d.practice ?? []).map((s) => (s.id === open.id ? { ...s, progress: s.progress.map((p, k) => (k === i ? { ...p, ...patch } : p)) } : s)) })),
      saveCard: (front, back, html) => (addCards(deck.id, [{ front, back, ...(html ? { html: true } : {}) }]), 'Als Karte gespeichert'),
      updateSet: (patch) => updateDeck(deck.id, (d) => ({ practice: (d.practice ?? []).map((s) => (s.id === open.id ? { ...s, ...patch } : s)) })),
    };
    return (
      <div className="practice">
        <button type="button" className="btn ghost sm" onClick={() => setOpenId(null)}>
          ‹ Alle Aufgaben
        </button>
        <PracticeSetView set={open} host={host} />
      </div>
    );
  }

  return (
    <div className="practice">
      {busy && job && <JobBanner job={job} />}
      <JobError job={job} />
      <section className="panel practice-new">
        <h2>Aufgaben zu diesem Deck</h2>
        <p className="muted">
          Die KI stellt aus dem Material dieses Decks Aufgaben zusammen, die du selbst löst – rechnen, ordnen, zuordnen, Fälle lösen, programmieren, Musik
          spielen. Ein Thema ganz ohne Karten lernst du unter <Link to="/skills">Skills</Link>.
        </p>
        {!ready ? (
          <NoKeyNotice compact />
        ) : (
          <>
            <div className="seg wrap" role="radiogroup" aria-label="Art der Aufgaben">
              {KINDS.map(([id, l]) => (
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
            {hasMaterial && <CostHint est={{ input: 1400 + Math.ceil(materialFrom(deck.source, deck.cards).length / 3.5), output: count * (type === 'java' || type === 'law' ? 700 : 450) }} />}
          </>
        )}
      </section>

      {sets.length > 0 && (
        <section className="panel">
          <h2>Deine Aufgaben</h2>
          <PracticeList sets={sets} onOpen={setOpenId} onDelete={(id) => updateDeck(deck.id, (d) => ({ practice: (d.practice ?? []).filter((x) => x.id !== id) }))} />
        </section>
      )}
      <p className="muted small">
        Labore zum Ausprobieren (Stochastik, Funktionen, Vektoren) und Werkzeuge findest du unter <Link to="/tools?tab=labs">Merkora Tools</Link>.
      </p>
    </div>
  );
}

export function PracticeList({ sets, onOpen, onDelete }: { sets: PracticeSet[]; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <ul className="practice-list">
      {sets.map((s) => {
        const n = problemCount(s), done = solvedCount(s);
        return (
          <li key={s.id}>
            <button type="button" className="practice-item" onClick={() => onOpen(s.id)}>
              <span className={'badge ' + s.kind}>{DOMAIN_LABEL[s.kind] ?? 'Übung'}</span>
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
            <button type="button" className="icon-btn" aria-label="Aufgaben löschen" title="Löschen" onClick={() => onDelete(s.id)}>
              <IconTrash size={15} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
