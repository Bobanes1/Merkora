import { useEffect, useRef, useState } from 'react';
import { addExam, updateExam, useData, type Exam } from '../lib/store';
import { dayKey } from '../lib/util';
import { Modal } from './Modal';

/** Create or edit an exam and choose the decks it covers. */
export function ExamDialog({ exam, presetDeckId, presetDate, onClose }: { exam?: Exam; presetDeckId?: string; presetDate?: string; onClose: () => void }) {
  const data = useData();
  const [title, setTitle] = useState(exam?.title ?? '');
  const [date, setDate] = useState(exam?.date ?? presetDate ?? dayKey(Date.now() + 14 * 86_400_000));
  const [time, setTime] = useState(exam?.time ?? '');
  const [note, setNote] = useState(exam?.note ?? '');
  const [deckIds, setDeckIds] = useState<string[]>(exam?.deckIds ?? (presetDeckId ? [presetDeckId] : []));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const toggle = (ids: string[], on: boolean) => setDeckIds((cur) => (on ? [...new Set([...cur, ...ids])] : cur.filter((x) => !ids.includes(x))));
  const ok = title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const save = () => {
    if (!ok) return;
    const patch = { title: title.trim(), date, time: time || undefined, note: note.trim() || undefined, deckIds };
    if (exam) updateExam(exam.id, patch);
    else addExam(patch);
    onClose();
  };

  return (
    <Modal
      title={exam ? 'Prüfung bearbeiten' : 'Prüfung eintragen'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={!ok}>
            Speichern
          </button>
        </>
      }
    >
      <label className="field-label" htmlFor="exam-title">
        Prüfung
      </label>
      <input
        id="exam-title"
        ref={ref}
        className="input"
        placeholder="z. B. Klausur PR-Forschung"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="exam-date">
            Datum
          </label>
          <input id="exam-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="exam-time">
            Uhrzeit (optional)
          </label>
          <input id="exam-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <span className="field-label">Welche Decks kommen dran?</span>
      <div className="exam-decks">
        {data.courses.map((c) => {
          const decks = data.decks.filter((d) => d.courseId === c.id);
          if (!decks.length) return null;
          const ids = decks.map((d) => d.id);
          const all = ids.every((id) => deckIds.includes(id));
          const some = !all && ids.some((id) => deckIds.includes(id));
          return (
            <div key={c.id} className="exam-course">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = some;
                  }}
                  onChange={(e) => toggle(ids, e.target.checked)}
                />
                <b>{c.name}</b>
              </label>
              {decks.map((d) => (
                <label key={d.id} className="check-row sub">
                  <input type="checkbox" checked={deckIds.includes(d.id)} onChange={(e) => toggle([d.id], e.target.checked)} />
                  <span>
                    {d.name} <small className="muted">· {d.cards.length} Karten</small>
                  </span>
                </label>
              ))}
            </div>
          );
        })}
        {!data.decks.length && <p className="muted small">Noch keine Decks vorhanden.</p>}
      </div>
      <label className="field-label" htmlFor="exam-note">
        Notiz (optional)
      </label>
      <input id="exam-note" className="input" placeholder="Raum, Hilfsmittel …" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="muted small">Karten dieser Decks werden so geplant, dass jede vor der Prüfung noch einmal drankommt.</p>
    </Modal>
  );
}
