import { useState } from 'react';
import { Link } from 'react-router-dom';
import { combineMaterialsText, unifiedCourseMaterials } from '../lib/courseDocs';
import { materialAsDeckFile } from '../lib/deckFiles';
import { DOMAIN_LABEL } from '../lib/practice';
import { nextLesson, skillProgress } from '../lib/skills';
import { updateSkill, useData, type Course, type DeckFile } from '../lib/store';
import { IconClose, IconPlus, IconSparkle } from './Icons';
import { Mascot } from './Mascot';
import { StartSkillModal } from './StartSkillModal';

/** Shows all Skills linked to a course/module, with quick link/unlink & creation from module materials. */
export function CourseSkills({ course, onOpenMaterial }: { course: Course; onOpenMaterial: () => void }) {
  const data = useData();
  const allSkills = data.skills ?? [];
  const linked = allSkills.filter((s) => s.courseId === course.id);
  const unlinked = allSkills.filter((s) => !s.courseId);
  const [linkPick, setLinkPick] = useState('');
  const [creating, setCreating] = useState(false);

  const materials = unifiedCourseMaterials(course, data.decks);
  const combinedText = combineMaterialsText(materials, 60000);
  const linkedFiles: DeckFile[] = materials
    .map((m) => materialAsDeckFile(m))
    .filter((f): f is DeckFile => f !== null);

  return (
    <div className="course-skills">
      <div className="course-skills-head">
        <div>
          <b>Skills in diesem Modul</b>
          <p className="muted small" style={{ margin: '2px 0 0' }}>
            Interaktive Lernpfade direkt verknüpft mit {course.name}.
          </p>
        </div>
        <div className="row-gap" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>
            <IconSparkle size={14} /> Neuen Skill starten
          </button>
        </div>
      </div>

      {linked.length > 0 ? (
        <div className="course-skill-list">
          {linked.map((s) => {
            const p = skillProgress(s);
            const nxt = nextLesson(s);
            return (
              <div key={s.id} className="course-skill-card">
                <Link to={`/skills/${s.id}`} className="course-skill-main">
                  <div className="row-gap">
                    <span className={'badge ' + s.domain} data-domain={s.domain}>
                      {DOMAIN_LABEL[s.domain]}
                    </span>
                    <b>{s.title}</b>
                  </div>
                  <small className="muted">
                    {s.status === 'planning'
                      ? 'Wird geplant …'
                      : `${p.done} von ${p.total} Lektionen${nxt ? ` · Nächste: ${nxt.lesson.title}` : ' · Abgeschlossen'}`}
                  </small>
                  {s.status === 'active' && p.total > 0 && (
                    <span className="bar" aria-hidden="true">
                      <i style={{ width: `${Math.round(p.share * 100)}%` }} />
                    </span>
                  )}
                </Link>
                <button
                  type="button"
                  className="icon-btn sm"
                  title="Verknüpfung mit diesem Modul lösen (Skill bleibt erhalten)"
                  aria-label={`Verknüpfung von ${s.title} lösen`}
                  onClick={() => updateSkill(s.id, { courseId: undefined })}
                >
                  <IconClose size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="course-skill-empty">
          <Mascot who="pip" mood="wave" size={68} />
          <p className="muted small" style={{ margin: 0 }}>
            Noch kein Skill mit diesem Modul verknüpft.
            {materials.length > 0
              ? ` Du hast bereits ${materials.length} ${materials.length === 1 ? 'Material-Eintrag' : 'Material-Einträge'} im Modul – starte direkt einen Skill daraus.`
              : ' Lade zuerst unter „Material“ deine PDFs oder Skripte hoch, oder starte direkt einen Skill zum Thema.'}
          </p>
          {materials.length === 0 && (
            <button type="button" className="btn outline sm" onClick={onOpenMaterial}>
              Zum Modul-Material
            </button>
          )}
        </div>
      )}

      {unlinked.length > 0 && (
        <div className="course-skill-link-row">
          <select
            className="input"
            aria-label="Bestehenden Skill verknüpfen"
            value={linkPick}
            onChange={(e) => setLinkPick(e.target.value)}
          >
            <option value="">Bestehenden Skill mit diesem Modul verknüpfen …</option>
            {unlinked.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn outline sm"
            disabled={!linkPick}
            onClick={() => {
              if (!linkPick) return;
              updateSkill(linkPick, { courseId: course.id });
              setLinkPick('');
            }}
          >
            <IconPlus size={13} /> Verknüpfen
          </button>
        </div>
      )}

      {creating && (
        <StartSkillModal
          initialTopic={course.name}
          material={combinedText}
          files={linkedFiles}
          courseId={course.id}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
