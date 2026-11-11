import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CreateWithAI } from '../components/CreateWithAI';
import { ExamDialog } from '../components/ExamDialog';
import {
  IconCalendar,
  IconCards,
  IconChevron,
  IconChevronDown,
  IconEdit,
  IconFolder,
  IconPlay,
  IconPlus,
  IconShuffle,
  IconSparkle,
  IconTrash,
} from '../components/Icons';
import { ConfirmModal, Modal, PromptModal } from '../components/Modal';
import { NewDeckModal } from '../components/NewDeck';
import { SessionBuilder } from '../components/SessionBuilder';
import { StudySession, type SessionItem } from '../components/StudySession';
import { countdownText, upcomingExams } from '../lib/exams';
import { masteryPercent } from '../lib/stats';
import {
  addCourse,
  addFolder,
  addWorkspace,
  deckUrl,
  deleteCourse,
  deleteDeck,
  deleteFolder,
  deleteWorkspace,
  dueCards,
  moveDeck,
  renameCourse,
  renameFolder,
  renameWorkspace,
  updateDeck,
  useData,
  type Course,
  type Deck,
  type Folder,
  type Workspace,
} from '../lib/store';
import { uniqueSlug } from '../lib/util';
import { shortNames } from '../lib/deckNames';
import CardsTab from './tabs/CardsTab';

type Dialog =
  | { kind: 'ws' }
  | { kind: 'course'; ws: Workspace }
  | { kind: 'deck'; course?: Course; folderId?: string }
  | { kind: 'folder'; course: Course }
  | { kind: 'rename-ws'; ws: Workspace }
  | { kind: 'rename-course'; course: Course }
  | { kind: 'rename-deck'; id: string; name: string }
  | { kind: 'rename-folder'; course: Course; folder: Folder }
  | { kind: 'move-deck'; deck: Deck }
  | { kind: 'del-ws'; ws: Workspace }
  | { kind: 'del-course'; course: Course }
  | { kind: 'del-deck'; id: string; name: string }
  | { kind: 'del-folder'; course: Course; folder: Folder }
  | { kind: 'exam' }
  | null;

/** Small round progress for decks and courses. */
function Mastery({ pct, size = 40 }: { pct: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <span className="mastery-ring" style={{ width: size, height: size }} title={`${pct}% gemeistert`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </span>
  );
}

export default function Library() {
  const { ws, course } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [create, setCreate] = useState<{ courseId?: string; back?: Course } | null>(null);
  const [builder, setBuilder] = useState(false);
  const [session, setSession] = useState<{ title: string; items: SessionItem[] } | null>(null);

  const workspace = ws ? data.workspaces.find((w) => w.slug === ws) : undefined;
  const crs = workspace && course ? data.courses.find((c) => c.workspaceId === workspace.id && c.slug === course) : undefined;
  const shownWs = workspace ? [workspace] : data.workspaces;

  useEffect(() => {
    document.title = `${crs?.name ?? workspace?.name ?? 'Bibliothek'} – Merkora`;
  }, [crs, workspace]);

  if ((ws && !workspace) || (course && !crs))
    return (
      <div className="page">
        <h1>Nicht gefunden</h1>
        <p className="muted">Diesen Bereich gibt es (auf diesem Gerät) nicht.</p>
        <Link className="btn primary" to="/library">
          Zur Bibliothek
        </Link>
      </div>
    );

  if (session)
    return (
      <div className="page">
        <StudySession title={session.title} items={session.items} onExit={() => setSession(null)} />
      </div>
    );

  return (
    <div className={crs ? 'page wide' : 'page'}>
      <nav className="crumbs" aria-label="Pfad">
        <Link to="/library">Bibliothek</Link>
        {workspace && (
          <>
            <span>›</span>
            <Link to={`/library/${workspace.slug}`}>{workspace.name}</Link>
          </>
        )}
        {crs && (
          <>
            <span>›</span>
            <span>{crs.name}</span>
          </>
        )}
      </nav>

      {crs && workspace ? (
        <CourseView course={crs} workspace={workspace} setDialog={setDialog} />
      ) : (
        <>
          <header className="page-head">
            <h1>{workspace?.name ?? 'Bibliothek'}</h1>
            <div className="row-gap">
              <button type="button" className="btn outline" onClick={() => setBuilder(true)} disabled={!data.decks.length}>
                <IconShuffle size={16} /> Lernrunde
              </button>
              <button type="button" className="btn outline" onClick={() => setCreate({})}>
                <IconSparkle size={16} /> Mit KI erstellen
              </button>
              {workspace ? (
                <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'course', ws: workspace })}>
                  <IconPlus size={16} /> Neuer Kurs
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'ws' })}>
                  <IconPlus size={16} /> Neuer Workspace
                </button>
              )}
            </div>
          </header>

          {shownWs.map((w) => {
            const courses = data.courses.filter((c) => c.workspaceId === w.id);
            return (
              <section key={w.id} className="ws-block">
                <div className="ws-head">
                  <h2>
                    <IconFolder size={18} /> <Link to={`/library/${w.slug}`}>{w.name}</Link>
                    <small className="muted">
                      {courses.length} {courses.length === 1 ? 'Kurs' : 'Kurse'}
                    </small>
                  </h2>
                  <div className="row-gap">
                    <button type="button" className="icon-btn" aria-label="Workspace umbenennen" onClick={() => setDialog({ kind: 'rename-ws', ws: w })}>
                      <IconEdit size={16} />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Workspace löschen" onClick={() => setDialog({ kind: 'del-ws', ws: w })}>
                      <IconTrash size={16} />
                    </button>
                  </div>
                </div>
                <div className="course-grid">
                  {courses.map((c) => (
                    <CourseCard key={c.id} course={c} ws={w} setDialog={setDialog} />
                  ))}
                  <button type="button" className="course-card add" onClick={() => setDialog({ kind: 'course', ws: w })}>
                    <IconPlus size={22} />
                    <b>Neuer Kurs</b>
                    <small>z. B. ein Fach oder Semester</small>
                  </button>
                </div>
              </section>
            );
          })}
        </>
      )}

      {dialog?.kind === 'ws' && (
        <PromptModal title="Neuer Workspace" label="Name" confirm="Erstellen" onClose={() => setDialog(null)} onSubmit={(v) => addWorkspace(v)} />
      )}
      {dialog?.kind === 'course' && (
        <PromptModal
          title="Neuer Kurs"
          label="Name des Kurses"
          confirm="Erstellen"
          onClose={() => setDialog(null)}
          onSubmit={(v) => {
            const c = addCourse(dialog.ws.id, v);
            navigate(`/library/${dialog.ws.slug}/${c.slug}`);
          }}
        />
      )}
      {dialog?.kind === 'folder' && (
        <PromptModal title="Neuer Ordner" label="Name des Ordners" confirm="Erstellen" onClose={() => setDialog(null)} onSubmit={(v) => addFolder(dialog.course.id, v)} />
      )}
      {dialog?.kind === 'deck' && (
        <NewDeckModal
          course={dialog.course}
          folderId={dialog.folderId}
          onClose={() => setDialog(null)}
          onAi={(courseId) => {
            const c = data.courses.find((x) => x.id === courseId);
            setCreate({ courseId, back: c });
          }}
        />
      )}
      {dialog?.kind === 'rename-ws' && (
        <PromptModal title="Workspace umbenennen" label="Name" initial={dialog.ws.name} onClose={() => setDialog(null)} onSubmit={(v) => renameWorkspace(dialog.ws.id, v)} />
      )}
      {dialog?.kind === 'rename-course' && (
        <PromptModal title="Kurs umbenennen" label="Name" initial={dialog.course.name} onClose={() => setDialog(null)} onSubmit={(v) => renameCourse(dialog.course.id, v)} />
      )}
      {dialog?.kind === 'rename-folder' && (
        <PromptModal
          title="Ordner umbenennen"
          label="Name"
          initial={dialog.folder.name}
          onClose={() => setDialog(null)}
          onSubmit={(v) => renameFolder(dialog.course.id, dialog.folder.id, v)}
        />
      )}
      {dialog?.kind === 'rename-deck' && (
        <PromptModal
          title="Deck umbenennen"
          label="Name"
          initial={dialog.name}
          onClose={() => setDialog(null)}
          onSubmit={(v) => {
            const deck = data.decks.find((d) => d.id === dialog.id)!;
            const taken = data.decks.filter((d) => d.courseId === deck.courseId && d.id !== deck.id).map((d) => d.slug);
            updateDeck(dialog.id, { name: v, slug: uniqueSlug(v, taken) });
          }}
        />
      )}
      {dialog?.kind === 'move-deck' && <MoveDeckModal deck={dialog.deck} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'del-ws' && (
        <ConfirmModal
          title="Workspace löschen?"
          text={`„${dialog.ws.name}“ mit allen Kursen, Decks und Karten wird gelöscht.`}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            deleteWorkspace(dialog.ws.id);
            if (workspace?.id === dialog.ws.id) navigate('/library');
          }}
        />
      )}
      {dialog?.kind === 'del-course' && (
        <ConfirmModal
          title="Kurs löschen?"
          text={`„${dialog.course.name}“ mit allen Decks und Karten wird gelöscht.`}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            deleteCourse(dialog.course.id);
            if (crs?.id === dialog.course.id) navigate('/library');
          }}
        />
      )}
      {dialog?.kind === 'del-folder' && (
        <ConfirmModal
          title="Ordner löschen?"
          text={`Der Ordner „${dialog.folder.name}“ wird entfernt. Seine Decks bleiben im Kurs erhalten.`}
          confirm="Ordner löschen"
          onClose={() => setDialog(null)}
          onConfirm={() => deleteFolder(dialog.course.id, dialog.folder.id)}
        />
      )}
      {dialog?.kind === 'del-deck' && (
        <ConfirmModal title="Deck löschen?" text={`„${dialog.name}“ mit allen Karten wird gelöscht.`} onClose={() => setDialog(null)} onConfirm={() => deleteDeck(dialog.id)} />
      )}
      {dialog?.kind === 'exam' && <ExamDialog onClose={() => setDialog(null)} />}
      {create && (
        <CreateWithAI
          courseId={create.courseId}
          onClose={() => setCreate(null)}
          onBack={
            create.back
              ? () => {
                  const back = create.back!;
                  setCreate(null);
                  setDialog({ kind: 'deck', course: back });
                }
              : undefined
          }
        />
      )}
      {builder && (
        <SessionBuilder
          onClose={() => setBuilder(false)}
          onStart={(title, items) => {
            setBuilder(false);
            setSession({ title, items });
          }}
        />
      )}
    </div>
  );
}

/** A course as a card: folder look, decks, progress, due cards and the next exam. */
function CourseCard({ course, ws, setDialog }: { course: Course; ws: Workspace; setDialog: (d: Dialog) => void }) {
  const data = useData();
  const decks = data.decks.filter((d) => d.courseId === course.id);
  const cards = decks.flatMap((d) => d.cards);
  const pct = masteryPercent(cards);
  const due = decks.reduce((a, d) => a + dueCards(d).length, 0);
  const exam = upcomingExams(data).find((e) => e.deckIds.some((id) => decks.some((d) => d.id === id)));
  return (
    <div className="course-card">
      <Link to={`/library/${ws.slug}/${course.slug}`} className="course-card-link">
        <span className="course-icon">
          <IconFolder size={22} />
        </span>
        <b>{course.name}</b>
        <small>
          {decks.length} {decks.length === 1 ? 'Deck' : 'Decks'}
          {(course.folders?.length ?? 0) > 0 && ` · ${course.folders!.length} ${course.folders!.length === 1 ? 'Ordner' : 'Ordner'}`} · {cards.length} Karten
        </small>
        <span className="course-bar">
          <span className="bar">
            <i style={{ width: `${pct}%` }} />
          </span>
          <small>{pct}%</small>
        </span>
        <span className="course-tags">
          {due > 0 ? <span className="pill-count">{due} fällig</span> : <span className="pill-ok">alles erledigt</span>}
          {exam && (
            <span className="exam-chip small">
              <IconCalendar size={12} /> {countdownText(exam)}
            </span>
          )}
        </span>
      </Link>
      <div className="course-card-actions">
        <button type="button" className="icon-btn" aria-label="Kurs umbenennen" onClick={() => setDialog({ kind: 'rename-course', course })}>
          <IconEdit size={15} />
        </button>
        <button type="button" className="icon-btn" aria-label="Kurs löschen" onClick={() => setDialog({ kind: 'del-course', course })}>
          <IconTrash size={15} />
        </button>
      </div>
    </div>
  );
}

/** Course page: key figures on top, decks in folders on the left, the chosen deck's cards on the right. */
function CourseView({ course, workspace, setDialog }: { course: Course; workspace: Workspace; setDialog: (d: Dialog) => void }) {
  const data = useData();
  const navigate = useNavigate();
  const decks = data.decks.filter((d) => d.courseId === course.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [addMenu, setAddMenu] = useState(false);
  const deck = decks.find((d) => d.id === selected) ?? decks[0];
  const cards = decks.flatMap((d) => d.cards);
  const pct = masteryPercent(cards);
  const due = decks.reduce((a, d) => a + dueCards(d).length, 0);
  const exam = upcomingExams(data).find((e) => e.deckIds.some((id) => decks.some((d) => d.id === id)));
  const folders = course.folders ?? [];
  const names = shortNames(decks);
  const loose = decks.filter((d) => !d.folderId || !folders.some((f) => f.id === d.folderId));

  const deckRow = (d: Deck) => {
    const n = dueCards(d).length;
    return (
      <div key={d.id} className={`cdeck ${deck?.id === d.id ? 'on' : ''}`}>
        <button type="button" className="cdeck-main" onClick={() => setSelected(d.id)}>
          <IconCards size={16} />
          <span className="cdeck-name" title={d.name}>{names.get(d.id)}</span>
          {n > 0 && <span className="pill-count">{n}</span>}
          <small className="cdeck-pct">{masteryPercent(d.cards)}%</small>
        </button>
        <span className="cdeck-actions">
          <button type="button" className="icon-btn" aria-label="Verschieben" title="In Ordner verschieben" onClick={() => setDialog({ kind: 'move-deck', deck: d })}>
            <IconFolder size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Umbenennen" onClick={() => setDialog({ kind: 'rename-deck', id: d.id, name: d.name })}>
            <IconEdit size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Löschen" onClick={() => setDialog({ kind: 'del-deck', id: d.id, name: d.name })}>
            <IconTrash size={14} />
          </button>
        </span>
      </div>
    );
  };

  return (
    <>
      <header className="course-head">
        <div className="course-title">
          <span className="course-icon">
            <IconFolder size={22} />
          </span>
          <h1>{course.name}</h1>
          <button type="button" className="icon-btn" aria-label="Kurs umbenennen" onClick={() => setDialog({ kind: 'rename-course', course })}>
            <IconEdit size={16} />
          </button>
        </div>
        <div className="course-stats">
          <div className="cstat">
            <small>Prüfungstermin</small>
            {exam ? (
              <Link to="/calendar" className="cstat-val">
                {exam.title} · {countdownText(exam)}
              </Link>
            ) : (
              <button type="button" className="link-btn cstat-val" onClick={() => setDialog({ kind: 'exam' })}>
                <IconPlus size={14} /> Prüfung festlegen
              </button>
            )}
          </div>
          <div className="cstat ring-stat">
            <Mastery pct={pct} size={46} />
            <div>
              <small>Beherrschung</small>
              <b className="cstat-big">{pct}%</b>
            </div>
          </div>
          <div className="cstat">
            <small>Heute fällig</small>
            <b className="cstat-big">{due}</b>
          </div>
          <div className="cstat">
            <small>Karten</small>
            <b className="cstat-big">{cards.length}</b>
          </div>
        </div>
      </header>

      <div className="course-split">
        <section className="panel course-decks">
          <div className="panel-head">
            <h2>
              Alle Decks <span className="count-badge">{decks.length}</span>
            </h2>
            <div className="add-wrap">
              <button type="button" className="btn outline sm" onClick={() => setAddMenu((v) => !v)} aria-expanded={addMenu}>
                <IconPlus size={14} /> Neu hinzufügen
              </button>
              {addMenu && (
                <div className="add-menu" role="menu" onMouseLeave={() => setAddMenu(false)}>
                  <button type="button" role="menuitem" onClick={() => (setAddMenu(false), setDialog({ kind: 'deck', course }))}>
                    <IconCards size={15} /> Deck
                  </button>
                  <button type="button" role="menuitem" onClick={() => (setAddMenu(false), setDialog({ kind: 'folder', course }))}>
                    <IconFolder size={15} /> Ordner
                  </button>
                </div>
              )}
            </div>
          </div>

          {folders.map((f) => {
            const inside = decks.filter((d) => d.folderId === f.id);
            const isClosed = closed[f.id];
            return (
              <div key={f.id} className="cfolder">
                <div className="cfolder-head">
                  <button type="button" className="cfolder-toggle" onClick={() => setClosed((c) => ({ ...c, [f.id]: !c[f.id] }))}>
                    {isClosed ? <IconChevron size={14} /> : <IconChevronDown size={14} />}
                    <IconFolder size={16} />
                    <b>{f.name}</b>
                    <small className="muted">{inside.length}</small>
                  </button>
                  <span className="cdeck-actions">
                    <button type="button" className="icon-btn" aria-label="Deck in diesem Ordner" title="Neues Deck in diesem Ordner" onClick={() => setDialog({ kind: 'deck', course, folderId: f.id })}>
                      <IconPlus size={14} />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Ordner umbenennen" onClick={() => setDialog({ kind: 'rename-folder', course, folder: f })}>
                      <IconEdit size={14} />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Ordner löschen" onClick={() => setDialog({ kind: 'del-folder', course, folder: f })}>
                      <IconTrash size={14} />
                    </button>
                  </span>
                </div>
                {!isClosed && (
                  <div className="cfolder-body">{inside.length ? inside.map(deckRow) : <p className="muted small">Leer – verschiebe Decks hierher.</p>}</div>
                )}
              </div>
            );
          })}
          {loose.map(deckRow)}
          {!decks.length && (
            <div className="empty">
              <b>Noch keine Decks</b>
              <p className="muted">Lege ein Deck an – leer, mit KI aus PDF, Word oder PowerPoint oder aus einem Anki-Stapel.</p>
              <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'deck', course })}>
                <IconPlus size={16} /> Neues Deck
              </button>
            </div>
          )}
        </section>

        <section className="panel course-preview">
          {deck ? (
            <>
              <div className="preview-head">
                <div>
                  <small className="muted">
                    {folders.find((f) => f.id === deck.folderId)?.name ?? workspace.name} › {course.name}
                  </small>
                  <h2 title={deck.name}>{names.get(deck.id) ?? deck.name}</h2>
                </div>
                <span className="grow" />
                <Link to={deckUrl(data, deck, 'cards')} className="btn ghost sm">
                  Deck öffnen
                </Link>
                <button type="button" className="btn primary sm" onClick={() => navigate(deckUrl(data, deck, 'learn'))}>
                  <IconPlay size={12} /> Lernen
                </button>
              </div>
              <CardsTab key={deck.id} deck={deck} onLearn={() => navigate(deckUrl(data, deck, 'learn'))} />
            </>
          ) : (
            <p className="muted">Wähle links ein Deck aus.</p>
          )}
        </section>
      </div>
    </>
  );
}

/** Move a deck into a folder or another course. */
function MoveDeckModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const data = useData();
  const [courseId, setCourseId] = useState(deck.courseId);
  const [folderId, setFolderId] = useState(deck.folderId ?? '');
  const course = data.courses.find((c) => c.id === courseId);
  return (
    <Modal
      title={`„${deck.name}“ verschieben`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              moveDeck(deck.id, folderId || undefined, courseId);
              onClose();
            }}
          >
            Verschieben
          </button>
        </>
      }
    >
      <label className="field-label" htmlFor="mv-course">
        Kurs
      </label>
      <select
        id="mv-course"
        className="input"
        value={courseId}
        onChange={(e) => {
          setCourseId(e.target.value);
          setFolderId('');
        }}
      >
        {data.courses.map((c) => (
          <option key={c.id} value={c.id}>
            {data.workspaces.find((w) => w.id === c.workspaceId)?.name} › {c.name}
          </option>
        ))}
      </select>
      <label className="field-label" htmlFor="mv-folder">
        Ordner
      </label>
      <select id="mv-folder" className="input" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
        <option value="">– direkt im Kurs –</option>
        {(course?.folders ?? []).map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {!(course?.folders ?? []).length && <p className="muted small">Dieser Kurs hat noch keine Ordner. Lege sie in der Kursansicht über „Neu hinzufügen › Ordner“ an.</p>}
    </Modal>
  );
}
