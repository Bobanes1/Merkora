import { useData } from '../lib/store';

/** Checklist of decks grouped by course (ticking a course selects all its decks). */
export function DeckPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const data = useData();
  const toggle = (ids: string[], on: boolean) => onChange(on ? [...new Set([...value, ...ids])] : value.filter((x) => !ids.includes(x)));
  return (
    <div className="exam-decks">
      {data.courses.map((c) => {
        const decks = data.decks.filter((d) => d.courseId === c.id);
        if (!decks.length) return null;
        const ids = decks.map((d) => d.id);
        const all = ids.every((id) => value.includes(id));
        const some = !all && ids.some((id) => value.includes(id));
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
                <input type="checkbox" checked={value.includes(d.id)} onChange={(e) => toggle([d.id], e.target.checked)} />
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
  );
}
