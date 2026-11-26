import { useState } from 'react';
import { attachSkillFiles, removeSkillFile } from '../lib/deckFiles';
import { MATERIAL_ACCEPT, readFileText } from '../lib/files';
import type { Skill } from '../lib/skills';
import { updateSkill, useData, type DeckFile } from '../lib/store';
import { CreateWithAI } from './CreateWithAI';
import { FileViewer } from './FileViewer';
import { IconCards, IconClose, IconNote, IconUpload } from './Icons';

/**
 * „Dein Material“: original documents of a skill + linked course/module selector
 * + 1-click creation of a flashcard deck from this skill's material (zero re-upload).
 */
export function SkillMaterial({ skill }: { skill: Skill }) {
  const data = useData();
  const files = skill.files ?? [];
  const [open, setOpen] = useState<DeckFile | null>(null);
  const [makeDeck, setMakeDeck] = useState(false);
  const [note, setNote] = useState('');

  const add = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    const texts: string[] = [];
    for (const f of picked) {
      try {
        texts.push(await readFileText(f));
      } catch (e) {
        setNote(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (texts.length) updateSkill(skill.id, (s) => ({ material: [s.material, ...texts].filter(Boolean).join('\n\n').slice(0, 60000) }));
    const n = await attachSkillFiles(skill.id, picked);
    if (n) setNote(`${n} ${n === 1 ? 'Datei' : 'Dateien'} hinzugefügt – die nächsten Lektionen richten sich auch danach.`);
  };

  const hasMaterial = Boolean(files.length || skill.material?.trim());
  const deckFallbackText =
    skill.material?.trim() ||
    skill.stages
      .flatMap((st) => [`## ${st.name}: ${st.goal}`, ...st.lessons.map((l) => `- ${l.title}: ${l.goal}`)])
      .join('\n');

  const initialMaterials = files.length
    ? files.map((f, idx) => ({
        name: f.name,
        text: idx === 0 ? (skill.material?.trim() || '') : '',
        file: f,
      }))
    : deckFallbackText
      ? [{ name: skill.title, text: deckFallbackText }]
      : [];

  return (
    <details className="panel skill-material" open={files.length > 0 && files.length <= 3}>
      <summary>
        Material &amp; Modul{' '}
        <small className="muted">
          {files.length ? `${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'}` : skill.material ? 'eingefügter Text' : 'optional'}
        </small>
      </summary>

      {data.courses.length > 0 && (
        <div className="skill-course-row">
          <label className="field-label" htmlFor={`sk-crs-${skill.id}`} style={{ margin: 0 }}>
            Verknüpftes Modul:
          </label>
          <select
            id={`sk-crs-${skill.id}`}
            className="input"
            value={skill.courseId ?? ''}
            onChange={(e) => updateSkill(skill.id, { courseId: e.target.value || undefined })}
          >
            <option value="">Keinem Modul zugeordnet</option>
            {data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {files.length > 0 && (
        <ul className="skill-file-list">
          {files.map((f) => (
            <li key={f.id}>
              <button type="button" className="link-btn grow" onClick={() => setOpen(f)}>
                <IconNote size={15} /> {f.name}
              </button>
              <small className="muted">{Math.max(1, Math.round(f.size / 1024))} KB</small>
              <button type="button" className="icon-btn sm" aria-label={`${f.name} entfernen`} onClick={() => removeSkillFile(skill.id, f.id)}>
                <IconClose size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!files.length && skill.material && <p className="muted small">Du hast Text eingefügt – der Lernpfad richtet sich danach. Dateien kannst du hier ergänzen.</p>}

      <div className="row-gap" style={{ flexWrap: 'wrap', marginTop: 6 }}>
        <label className="btn outline sm">
          <IconUpload size={14} /> Dateien hinzufügen
          <input type="file" multiple accept={MATERIAL_ACCEPT} hidden onChange={(e) => void add(e.target.files)} />
        </label>
        {(hasMaterial || deckFallbackText.length >= 40) && (
          <button type="button" className="btn outline sm" onClick={() => setMakeDeck(true)}>
            <IconCards size={14} /> Kartendeck daraus erstellen
          </button>
        )}
      </div>

      {note && <small className="muted"> {note}</small>}
      {open && <FileViewer file={open} onClose={() => setOpen(null)} />}
      {makeDeck && (
        <CreateWithAI
          courseId={skill.courseId}
          initialTitle={skill.title}
          initialMaterials={initialMaterials}
          onClose={() => setMakeDeck(false)}
        />
      )}
    </details>
  );
}
