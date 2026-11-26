import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasKey } from '../lib/ai';
import { levelLabel } from '../lib/mockExamCore';
import { startSkill } from '../lib/skillRun';
import { setSettings, useData, type DeckFile } from '../lib/store';
import { IconSparkle } from './Icons';
import { Modal } from './Modal';
import { NoKeyNotice } from './NoKey';

const GOAL_LABEL: Record<string, string> = {
  exam: 'für eine Prüfung',
  job: 'für Beruf / Praxis',
  fun: 'aus Interesse',
};

function defaultLevel(st: { skillLevel?: string; eduLevel?: string; eduDetail?: string }) {
  if (st.skillLevel !== undefined) return st.skillLevel;
  if (!st.eduLevel) return '';
  return levelLabel(st.eduLevel) + (st.eduDetail ? ` (${st.eduDetail})` : '');
}

/**
 * Focused modal to start a Skill directly from existing course/module materials or a deck,
 * reusing already-stored files without re-uploading.
 */
export function StartSkillModal({
  initialTopic,
  material,
  files = [],
  courseId: presetCourseId,
  onClose,
}: {
  initialTopic: string;
  material: string;
  files?: DeckFile[];
  courseId?: string;
  onClose: () => void;
}) {
  const data = useData();
  const navigate = useNavigate();
  const st = data.settings;
  const [topic, setTopic] = useState(initialTopic);
  const [level, setLevel] = useState(() => defaultLevel(st));
  const [courseId, setCourseId] = useState(presetCourseId ?? '');

  if (!hasKey()) {
    return (
      <Modal title="Skill erstellen" onClose={onClose}>
        <NoKeyNotice />
      </Modal>
    );
  }

  const withGoal = (lv: string) => (st.skillGoal && GOAL_LABEL[st.skillGoal] ? [lv, `Ziel: ${GOAL_LABEL[st.skillGoal]}`].filter(Boolean).join(' – ') : lv);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setSettings({ skillLevel: level });
    const id = startSkill(topic.trim(), withGoal(level), material, {
      courseId: courseId || undefined,
      files: files.length ? files : undefined,
    });
    onClose();
    navigate(`/skills/${id}`);
  };

  return (
    <Modal
      title="Skill aus Material erstellen"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" form="start-skill-form" className="btn primary" disabled={!topic.trim()}>
            <IconSparkle size={14} /> Skill starten
          </button>
        </>
      }
    >
      <form id="start-skill-form" onSubmit={submit} className="stack-gap">
        <p className="muted small" style={{ margin: 0 }}>
          Pip plant anhand deines Materials einen interaktiven Lernpfad mit aktiven Übungslektionen.
          {files.length > 0 && ` (${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'} direkt verknüpft, ${material.trim().length.toLocaleString('de-DE')} Zeichen)`}
          {!files.length && material.trim().length > 0 && ` (${material.trim().length.toLocaleString('de-DE')} Zeichen Material übernommen)`}
        </p>

        <div>
          <label className="field-label" htmlFor="ssm-topic">
            Skill-Thema / Titel
          </label>
          <input
            id="ssm-topic"
            className="input"
            autoFocus
            value={topic}
            placeholder="z. B. Zellbiologie, Statistik, Vertragsrecht …"
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="ssm-level">
            Niveau (optional)
          </label>
          <input
            id="ssm-level"
            className="input"
            value={level}
            placeholder="z. B. Bachelor 2. Semester, Gymnasium, Einsteiger …"
            onChange={(e) => setLevel(e.target.value)}
          />
        </div>

        {data.courses.length > 0 && (
          <div>
            <label className="field-label" htmlFor="ssm-course">
              Modul / Kurs verknüpfen
            </label>
            <select id="ssm-course" className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Keinem Modul zugeordnet</option>
              {data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </form>
    </Modal>
  );
}
