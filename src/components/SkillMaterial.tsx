import { useState } from 'react';
import { attachSkillFiles, removeSkillFile } from '../lib/deckFiles';
import { MATERIAL_ACCEPT, readFileText } from '../lib/files';
import type { Skill } from '../lib/skills';
import { updateSkill, type DeckFile } from '../lib/store';
import { FileViewer } from './FileViewer';
import { IconClose, IconNote, IconUpload } from './Icons';

/** „Dein Material“: the original documents of a skill – open them, add more (their text also feeds the next lessons), remove them. */
export function SkillMaterial({ skill }: { skill: Skill }) {
  const files = skill.files ?? [];
  const [open, setOpen] = useState<DeckFile | null>(null);
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
  if (!files.length && !skill.material) return null;
  return (
    <details className="panel skill-material" open={files.length > 0 && files.length <= 3}>
      <summary>
        Dein Material <small className="muted">{files.length ? `${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'}` : 'eingefügter Text'}</small>
      </summary>
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
      <label className="btn outline sm">
        <IconUpload size={14} /> Dateien hinzufügen
        <input type="file" multiple accept={MATERIAL_ACCEPT} hidden onChange={(e) => void add(e.target.files)} />
      </label>
      {note && <small className="muted"> {note}</small>}
      {open && <FileViewer file={open} onClose={() => setOpen(null)} />}
    </details>
  );
}
