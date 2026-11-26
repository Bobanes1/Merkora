import { useEffect, useState } from 'react';
import { DeckCoverOf } from '../components/DeckCover';
import { DeckSettingsModal } from '../components/DeckSettingsModal';
import { Plant } from '../components/Plant';
import { Mascot } from '../components/Mascot';
import { isLeech } from '../lib/cardLinks';
import { estimateStudyMinutes, formatEstMinutes } from '../lib/deckTools';
import { undoable } from '../lib/undo';
import { accentFor } from '../lib/util';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CreateWithAI } from '../components/CreateWithAI';
import { Mastery } from '../components/Mastery';
import { ExamDialog } from '../components/ExamDialog';
import {
  IconCalendar,
  IconCards,
  IconChevron,
  IconChevronDown,
  IconEdit,
  IconFolder,
  IconGrid,
  IconList,
  IconPlay,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShuffle,
  IconSparkle,
  IconStar,
  IconStarLine,
  IconTrash,
} from '../components/Icons';
import { ConfirmModal, Modal, PromptModal } from '../components/Modal';
import { NewDeckModal } from '../components/NewDeck';
import { SessionBuilder } from '../components/SessionBuilder';
import { StudySession, type SessionItem } from '../components/StudySession';
import { countdownText, examCovers, upcomingExams } from '../lib/exams';
import { courseSummary, masteryPercent, sortCourses, type CourseSort } from '../lib/stats';
import { allAcross, dueAcross } from '../lib/sessions';
import { unifiedCourseMaterials } from '../lib/courseDocs';
import { CourseDocs } from '../components/CourseDocs';
import { CourseSkills } from '../components/CourseSkills';
import { KnowledgeGraphView } from '../components/KnowledgeGraphView';
import { usePhone } from '../lib/phone';
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
  newCardsLeft,
  renameCourse,
  renameFolder,
  renameWorkspace,
  reorderDecks,
  setSettings,
  toggleArchiveCourse,
  togglePinCourse,
  togglePinDeck,
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
  | { kind: 'deck-settings'; deck: Deck }
  | { kind: 'del-ws'; ws: Workspace }
  | { kind: 'del-course'; course: Course }
  | { kind: 'del-deck'; id: string; name: string }
  | { kind: 'del-folder'; course: Course; folder: Folder }
  | { kind: 'exam' }
  | null;

type LibFilter = 'all' | 'due' | 'exam' | 'leech' | 'pinned' | 'archived';

export default function Library() {
  const { ws, course } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [create, setCreate] = useState<{ courseId?: string; back?: Course } | null>(null);
  const [builder, setBuilder] = useState(false);
  const [session, setSession] = useState<{ title: string; items: SessionItem[] } | null>(null);
  const [libQuery, setLibQuery] = useState('');
  const [libFilter, setLibFilter] = useState<LibFilter>('all');

  const workspace = ws ? data.workspaces.find((w) => w.slug === ws) : undefined;
  const crs = workspace && course ? data.courses.find((c) => c.workspaceId === workspace.id && c.slug === course) : undefined;
  const shownWs = workspace ? [workspace] : data.workspaces;
  const phone = usePhone();
  const view = phone ? 'list' : (data.settings.libraryView ?? 'tiles');

  const archivedCourseCount = data.courses.filter((c) => c.archived).length;
  const exams = upcomingExams(data);

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

  const qLower = libQuery.trim().toLowerCase();
  const filterCourses = (list: Course[]) => {
    const matched = list.filter((c) => {
      if (libFilter === 'archived') return !!c.archived;
      if (c.archived) return false;
      const cDecks = data.decks.filter((d) => d.courseId === c.id && !d.archived);
      if (libFilter === 'pinned' && !c.pinned && !cDecks.some((d) => d.pinned)) return false;
      if (libFilter === 'due' && cDecks.reduce((n, d) => n + dueCards(d).length, 0) === 0) return false;
      if (libFilter === 'exam' && !exams.some((e) => cDecks.some((d) => examCovers(e, d)))) return false;
      if (libFilter === 'leech' && !cDecks.some((d) => d.cards.some(isLeech))) return false;
      if (qLower) {
        const hitCourse = c.name.toLowerCase().includes(qLower);
        const hitDeck = cDecks.some((d) => d.name.toLowerCase().includes(qLower));
        if (!hitCourse && !hitDeck) return false;
      }
      return true;
    });
    return [...matched].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  };

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
        <CourseView course={crs} workspace={workspace} setDialog={setDialog} onStudy={(title, items) => setSession({ title, items })} />
      ) : (
        <>
          <header className="page-head">
            <div className="page-title">
              <h1>{workspace?.name ?? 'Bibliothek'}</h1>
              {!workspace && <p className="page-intro">Deine Kurse und Decks mit allen Karteikarten – hier legst du neue an, sortierst sie und startest das Lernen.</p>}
            </div>
            <div className="row-gap">
              {!phone && (
              <div className="seg view-toggle" role="radiogroup" aria-label="Ansicht">
                <button type="button" role="radio" aria-checked={view === 'tiles'} className={view === 'tiles' ? 'on' : ''} title="Kacheln" onClick={() => setSettings({ libraryView: undefined })}>
                  <IconGrid size={15} /> <span>Kacheln</span>
                </button>
                <button type="button" role="radio" aria-checked={view === 'list'} className={view === 'list' ? 'on' : ''} title="Liste" onClick={() => setSettings({ libraryView: 'list' })}>
                  <IconList size={15} /> <span>Liste</span>
                </button>
              </div>
              )}
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

          <div className="lib-filterbar">
            <div className="search lib-search">
              <IconSearch size={15} />
              <input
                type="search"
                placeholder="Kurse oder Decks filtern …"
                value={libQuery}
                onChange={(e) => setLibQuery(e.target.value)}
                aria-label="Bibliothek filtern"
              />
            </div>
            <div className="chips">
              {(
                [
                  ['all', 'Alle'],
                  ['due', 'Fällig'],
                  ['exam', 'Prüfung bald'],
                  ['leech', 'Problemkarten'],
                  ['pinned', 'Angeheftet'],
                ] as [LibFilter, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" className={`chip ${libFilter === id ? 'on' : ''}`} onClick={() => setLibFilter(id)}>
                  {label}
                </button>
              ))}
              {archivedCourseCount > 0 && (
                <button type="button" className={`chip ${libFilter === 'archived' ? 'on' : ''}`} onClick={() => setLibFilter(libFilter === 'archived' ? 'all' : 'archived')}>
                  Archiv ({archivedCourseCount})
                </button>
              )}
            </div>
          </div>

          {shownWs.map((w) => {
            const rawCourses = data.courses.filter((c) => c.workspaceId === w.id);
            const courses = filterCourses(rawCourses);
            if ((qLower || libFilter !== 'all') && courses.length === 0) return null;
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
                    <button type="button" className="icon-btn" aria-label="Workspace löschen" onClick={() => undoable(`Workspace „${w.name}“ gelöscht`, () => (deleteWorkspace(w.id), workspace?.id === w.id && navigate('/library')))}>
                      <IconTrash size={16} />
                    </button>
                  </div>
                </div>
                {view === 'list' ? (
                  <CourseList courses={courses} ws={w} setDialog={setDialog} />
                ) : (
                <div className="course-grid">
                  {courses.map((c) => (
                    <CourseCard key={c.id} course={c} ws={w} setDialog={setDialog} />
                  ))}
                  {libFilter !== 'archived' && (
                    <button type="button" className="course-card add" onClick={() => setDialog({ kind: 'course', ws: w })}>
                      <IconPlus size={22} />
                      <b>Neuer Kurs</b>
                      <small>z. B. ein Fach oder Semester</small>
                    </button>
                  )}
                </div>
                )}
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
      {dialog?.kind === 'deck-settings' && (
        <DeckSettingsModal deck={data.decks.find((x) => x.id === dialog.deck.id) ?? dialog.deck} onClose={() => setDialog(null)} />
      )}
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

/** A course as a card: folder look, decks, progress, due cards, pin/archive and the next exam. */
function CourseCard({ course, ws, setDialog }: { course: Course; ws: Workspace; setDialog: (d: Dialog) => void }) {
  const data = useData();
  const decks = data.decks.filter((d) => d.courseId === course.id && !d.archived);
  const sum = courseSummary(course, decks, (d) => dueCards(d as Deck).length);
  const pct = sum.mastery;
  const due = sum.due;
  const exam = upcomingExams(data).find((e) => decks.some((d) => examCovers(e, d)));
  return (
    <div className={`course-card${course.pinned ? ' pinned' : ''}${course.archived ? ' archived' : ''}`} style={{ ['--acc' as string]: `var(--c${accentFor(course.id)})` }}>
      <Link to={`/library/${ws.slug}/${course.slug}`} className="course-card-link">
        <span className="course-icon">
          <IconFolder size={22} />
        </span>
        <b>
          {course.name}
          {course.pinned && <IconStar size={12} className="pin-star" />}
        </b>
        <small>
          {decks.length} {decks.length === 1 ? 'Deck' : 'Decks'}
          {sum.folders > 0 && ` · ${sum.folders} Ordner`} · {sum.cards} Karten
        </small>
        <span className="course-bar">
          <span className="bar">
            <i style={{ width: `${pct}%` }} />
          </span>
          <small>{pct}%</small>
        </span>
        <span className="course-tags">
          {course.archived ? (
            <span className="badge">Archiviert</span>
          ) : due > 0 ? (
            <span className="pill-count">{due} fällig</span>
          ) : (
            <span className="pill-ok">alles erledigt</span>
          )}
          {exam && (
            <span className="exam-chip small">
              <IconCalendar size={12} /> {countdownText(exam)}
            </span>
          )}
        </span>
      </Link>
      <div className="course-card-actions">
        <button type="button" className={'icon-btn' + (course.pinned ? ' on' : '')} aria-label={course.pinned ? 'Lösen' : 'Anheften'} title={course.pinned ? 'Nicht mehr anheften' : 'Oben anheften'} onClick={() => togglePinCourse(course.id)}>
          {course.pinned ? <IconStar size={14} /> : <IconStarLine size={14} />}
        </button>
        <button type="button" className="icon-btn" aria-label={course.archived ? 'Aus Archiv holen' : 'Archivieren'} title={course.archived ? 'Aus Archiv holen' : 'Kurs archivieren'} onClick={() => toggleArchiveCourse(course.id)}>
          <IconFolder size={14} />
        </button>
        <button type="button" className="icon-btn" aria-label="Kurs umbenennen" onClick={() => setDialog({ kind: 'rename-course', course })}>
          <IconEdit size={15} />
        </button>
        <button type="button" className="icon-btn" aria-label="Kurs löschen" onClick={() => undoable(`Kurs „${course.name}“ gelöscht`, () => deleteCourse(course.id))}>
          <IconTrash size={15} />
        </button>
      </div>
    </div>
  );
}

/** Library as a list: one row per course (sortable), folders and decks fold out below it. */
function CourseList({ courses, ws, setDialog }: { courses: Course[]; ws: Workspace; setDialog: (d: Dialog) => void }) {
  const data = useData();
  const [sort, setSort] = useState<{ by: CourseSort; asc: boolean }>({ by: 'name', asc: true });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const exams = upcomingExams(data);
  const list = sortCourses(
    courses.map((c) => ({ course: c, name: c.name, sum: courseSummary(c, data.decks, (d) => dueCards(d as Deck).length) })),
    sort.by,
    sort.asc,
  );
  const head = (by: CourseSort, label: string) => (
    <button
      type="button"
      className={'clist-sort' + (sort.by === by ? ' on' : '')}
      aria-sort={sort.by === by ? (sort.asc ? 'ascending' : 'descending') : undefined}
      onClick={() => setSort((s) => ({ by, asc: s.by === by ? !s.asc : by === 'name' }))}
    >
      {label}
      {sort.by === by ? (sort.asc ? ' ↑' : ' ↓') : ''}
    </button>
  );
  const deckLink = (d: Deck, indent: boolean) => {
    const n = dueCards(d).length;
    return (
      <Link key={d.id} to={deckUrl(data, d)} className={'clist-deck' + (indent ? ' deep' : '')}>
        <IconCards size={14} />
        <span className="clist-deck-name" title={d.name}>
          {d.name}
        </span>
        <small className="muted">{d.cards.length} {d.cards.length === 1 ? 'Karte' : 'Karten'}</small>
        {n > 0 && <span className="pill-count">{n}</span>}
      </Link>
    );
  };
  return (
    <div className="clist">
      <div className="clist-head">
        <span className="clist-name">{head('name', 'Kurs')}</span>
        <span className="clist-num">{head('cards', 'Karten')}</span>
        <span className="clist-pct">{head('mastery', 'Fortschritt')}</span>
        <span className="clist-due">{head('due', 'Fällig')}</span>
        <span className="clist-exam">Prüfung</span>
        <span className="clist-act" />
      </div>
      {list.map(({ course: c, sum }) => {
        const decks = data.decks.filter((d) => d.courseId === c.id);
        const folders = (c.folders ?? []).filter((f) => decks.some((d) => d.folderId === f.id));
        const loose = decks.filter((d) => !d.folderId || !(c.folders ?? []).some((f) => f.id === d.folderId));
        const exam = exams.find((e) => decks.some((d) => examCovers(e, d)));
        const isOpen = open.has(c.id);
        return (
          <div key={c.id} className={'clist-course' + (isOpen ? ' open' : '')}>
            <div className="clist-row">
              <span className="clist-name">
                <button
                  type="button"
                  className="icon-btn clist-toggle"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? 'Zuklappen' : 'Ordner und Decks zeigen'}
                  disabled={!decks.length}
                  onClick={() => setOpen((o) => (o.has(c.id) ? new Set([...o].filter((x) => x !== c.id)) : new Set(o).add(c.id)))}
                >
                  <IconChevronDown size={15} className="fold-chev" />
                </button>
                <IconFolder size={17} className="clist-icon" />
                <Link to={`/library/${ws.slug}/${c.slug}`} title={c.name}>
                  {c.name}
                </Link>
              </span>
              <span className="clist-num">
                <small className="muted">
                  {sum.decks} {sum.decks === 1 ? 'Deck' : 'Decks'}
                  {sum.folders > 0 && ` · ${sum.folders} Ordner`} ·{' '}
                </small>
                {sum.cards}
              </span>
              <span className="clist-pct">
                <span className="bar mini">
                  <i style={{ width: `${sum.mastery}%` }} />
                </span>
                <small>{sum.mastery}%</small>
              </span>
              <span className="clist-due">{sum.due > 0 ? <span className="pill-count">{sum.due}</span> : <span className="pill-ok">erledigt</span>}</span>
              <span className="clist-exam">
                {exam && (
                  <span className="exam-chip small" title={exam.title}>
                    <IconCalendar size={12} /> {countdownText(exam)}
                  </span>
                )}
              </span>
              <span className="clist-act">
                <button type="button" className="icon-btn" aria-label="Kurs umbenennen" onClick={() => setDialog({ kind: 'rename-course', course: c })}>
                  <IconEdit size={15} />
                </button>
                <button type="button" className="icon-btn" aria-label="Kurs löschen" onClick={() => undoable(`Kurs „${c.name}“ gelöscht`, () => deleteCourse(c.id))}>
                  <IconTrash size={15} />
                </button>
              </span>
            </div>
            {isOpen && (
              <div className="clist-body">
                {folders.map((f) => (
                  <div key={f.id} className="clist-folder">
                    <span className="clist-folder-name">
                      <IconFolder size={14} /> <b>{f.name}</b>
                    </span>
                    {decks.filter((d) => d.folderId === f.id).map((d) => deckLink(d, true))}
                  </div>
                ))}
                {loose.map((d) => deckLink(d, false))}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="clist-add" onClick={() => setDialog({ kind: 'course', ws })}>
        <IconPlus size={15} /> Neuer Kurs
      </button>
    </div>
  );
}

/** Course page: key figures on top, decks in folders on the left (drag & drop), the chosen deck's cards on the right. */
function CourseView({
  course,
  workspace,
  setDialog,
  onStudy,
}: {
  course: Course;
  workspace: Workspace;
  setDialog: (d: Dialog) => void;
  onStudy: (title: string, items: SessionItem[]) => void;
}) {
  const data = useData();
  const navigate = useNavigate();
  const [deckQuery, setDeckQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [dragDeckId, setDragDeckId] = useState<string | null>(null);
  const [overTarget, setOverTarget] = useState<string | null>(null);

  const rawCourseDecks = data.decks.filter((d) => d.courseId === course.id);
  const archivedCount = rawCourseDecks.filter((d) => d.archived).length;
  const sortGroup = (list: Deck[]) =>
    [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.order ?? 1e9) - (b.order ?? 1e9) || a.createdAt - b.createdAt);
  const decks = sortGroup(
    rawCourseDecks.filter((d) => {
      if (showArchived ? !d.archived : d.archived) return false;
      if (deckQuery.trim() && !d.name.toLowerCase().includes(deckQuery.trim().toLowerCase())) return false;
      return true;
    }),
  );
  const activeCourseDecks = rawCourseDecks.filter((d) => !d.archived);
  const [selected, setSelected] = useState<string | null>(null);
  // right column: the chosen deck's cards, the module Materialbox, linked skills, or knowledge graph
  const [view, setView] = useState<'deck' | 'docs' | 'skills' | 'graph'>(() => (activeCourseDecks.length === 0 ? 'docs' : 'deck'));
  const phone = usePhone();
  const docCount = unifiedCourseMaterials(course, data.decks).length;
  const skillCount = (data.skills ?? []).filter((s) => s.courseId === course.id).length;
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [addMenu, setAddMenu] = useState(false);
  const deck = decks.find((d) => d.id === selected) ?? decks[0];
  const cards = activeCourseDecks.flatMap((d) => d.cards);
  const pct = masteryPercent(cards);
  const due = activeCourseDecks.reduce((a, d) => a + dueCards(d).length, 0);
  const dueEst = formatEstMinutes(estimateStudyMinutes(due, data.reviews));
  const exam = upcomingExams(data).find((e) => activeCourseDecks.some((d) => examCovers(e, d)));
  const folders = course.folders ?? [];
  const names = shortNames(decks);
  const loose = decks.filter((d) => !d.folderId || !folders.some((f) => f.id === d.folderId));
  // a whole folder or course in one round: due cards first; with nothing due, practise all of them
  const studyButton = (title: string, group: Deck[], label: (n: number) => string, cls = 'btn outline sm') => {
    const items = dueAcross(group, (d) => newCardsLeft(d as Deck));
    const total = group.reduce((a, d) => a + d.cards.length, 0);
    if (!total) return null;
    return (
      <button
        type="button"
        className={cls}
        title={items.length ? `${items.length} fällige Karten aus ${group.length} Decks lernen` : 'Alles erledigt – trotzdem alle Karten üben (ohne den Plan zu verschieben)'}
        onClick={() => onStudy(title, items.length ? items : allAcross(group))}
      >
        <IconPlay size={12} /> {label(items.length)}
      </button>
    );
  };

  const dropIntoFolder = (folderId: string | undefined) => {
    if (!dragDeckId) return;
    moveDeck(dragDeckId, folderId, course.id);
    setDragDeckId(null);
    setOverTarget(null);
  };

  const dropOntoDeck = (target: Deck) => {
    if (!dragDeckId || dragDeckId === target.id) return;
    const dragged = rawCourseDecks.find((x) => x.id === dragDeckId);
    if (!dragged) return;
    if (dragged.folderId !== target.folderId) {
      moveDeck(dragDeckId, target.folderId, course.id);
    }
    const siblings = sortGroup(rawCourseDecks.filter((x) => x.folderId === target.folderId && !x.archived));
    const ids = siblings.map((x) => x.id).filter((id) => id !== dragDeckId);
    const toIdx = ids.indexOf(target.id);
    ids.splice(toIdx < 0 ? ids.length : toIdx, 0, dragDeckId);
    reorderDecks(ids);
    setDragDeckId(null);
    setOverTarget(null);
  };

  const deckRow = (d: Deck) => {
    const n = dueCards(d).length;
    return (
      <div
        key={d.id}
        draggable
        onDragStart={(e) => {
          setDragDeckId(d.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (!dragDeckId || dragDeckId === d.id) return;
          e.preventDefault();
          e.stopPropagation();
          setOverTarget('deck:' + d.id);
        }}
        onDragLeave={() => overTarget === 'deck:' + d.id && setOverTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dropOntoDeck(d);
        }}
        onDragEnd={() => (setDragDeckId(null), setOverTarget(null))}
        className={`cdeck ${deck?.id === d.id ? 'on' : ''}${d.pinned ? ' pinned' : ''}${overTarget === 'deck:' + d.id ? ' drag-over' : ''}`}
      >
        <button
          type="button"
          className="cdeck-main"
          title={selected === d.id ? 'Nochmal klicken zum Öffnen · ziehbar zum Sortieren' : 'Ziehbar in Ordner oder zum Sortieren'}
          onClick={() => {
            if (phone || (selected === d.id && view === 'deck')) return navigate(deckUrl(data, d));
            setSelected(d.id);
            setView('deck');
          }}
        >
          <DeckCoverOf deck={d} size={22} />
          <span className="cdeck-name" title={d.name}>
            {names.get(d.id)}
            {d.pinned && <IconStar size={11} className="pin-star" />}
          </span>
          {n > 0 && <span className="pill-count">{n}</span>}
          <Plant pct={masteryPercent(d.cards)} size={22} />
          <small className="cdeck-pct">{masteryPercent(d.cards)}%</small>
        </button>
        <span className="cdeck-actions">
          <button type="button" className={'icon-btn' + (d.pinned ? ' on' : '')} aria-label={d.pinned ? 'Lösen' : 'Anheften'} title={d.pinned ? 'Nicht mehr anheften' : 'Oben anheften'} onClick={() => togglePinDeck(d.id)}>
            {d.pinned ? <IconStar size={13} /> : <IconStarLine size={13} />}
          </button>
          <button type="button" className="icon-btn" aria-label="Deck-Einstellungen" title="Limits, Duplizieren, Zusammenführen, Archiv" onClick={() => setDialog({ kind: 'deck-settings', deck: d })}>
            <IconSettings size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Verschieben" title="In Ordner oder anderen Kurs verschieben" onClick={() => setDialog({ kind: 'move-deck', deck: d })}>
            <IconFolder size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Umbenennen" onClick={() => setDialog({ kind: 'rename-deck', id: d.id, name: d.name })}>
            <IconEdit size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Löschen" onClick={() => undoable(`Deck „${d.name}“ gelöscht`, () => deleteDeck(d.id))}>
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
          <span className="grow" />
          <button type="button" className={'btn sm ' + (view === 'docs' ? 'soft' : 'outline')} aria-pressed={view === 'docs'} onClick={() => setView(view === 'docs' ? 'deck' : 'docs')}>
            <IconFolder size={14} /> Material{docCount > 0 ? ` (${docCount})` : ''}
          </button>
          <button type="button" className={'btn sm ' + (view === 'skills' ? 'soft' : 'outline')} aria-pressed={view === 'skills'} onClick={() => setView(view === 'skills' ? 'deck' : 'skills')}>
            <IconStar size={14} /> Skills{skillCount > 0 ? ` (${skillCount})` : ''}
          </button>
          <button type="button" className={'btn sm ' + (view === 'graph' ? 'soft' : 'outline')} aria-pressed={view === 'graph'} onClick={() => setView(view === 'graph' ? 'deck' : 'graph')}>
            Graph
          </button>
          {studyButton(`Kurs: ${course.name}`, activeCourseDecks, (n) => (n ? `Ganzen Kurs lernen (${n}${dueEst ? ` · ${dueEst}` : ''})` : 'Ganzen Kurs üben'), 'btn primary sm')}
        </div>
        <div className="course-stats">
          <div className="cstat">
            <small>Prüfungstermin</small>
            {exam ? (
              <Link to="/tools?tab=exams" className="cstat-val">
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
            <small>Heute fällig{dueEst ? ` (${dueEst})` : ''}</small>
            <b className="cstat-big">{due}</b>
          </div>
          <div className="cstat">
            <small>Karten</small>
            <b className="cstat-big">{cards.length}</b>
          </div>
        </div>
      </header>

      <div className="course-split">
        {phone && view === 'docs' ? (
          <section className="panel">
            <CourseDocs course={course} />
          </section>
        ) : phone && view === 'skills' ? (
          <section className="panel">
            <CourseSkills course={course} onOpenMaterial={() => setView('docs')} />
          </section>
        ) : phone && view === 'graph' ? (
          <section className="panel">
            <KnowledgeGraphView courseId={course.id} />
          </section>
        ) : (
        <section className="panel course-decks">
          <div className="panel-head">
            <h2>
              {showArchived ? 'Archivierte Decks' : 'Alle Decks'} <span className="count-badge">{decks.length}</span>
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

          {(rawCourseDecks.length > 3 || archivedCount > 0) && (
            <div className="cdeck-filter-row">
              <div className="search grow">
                <IconSearch size={14} />
                <input
                  type="search"
                  placeholder="Decks suchen …"
                  value={deckQuery}
                  onChange={(e) => setDeckQuery(e.target.value)}
                  aria-label="Decks im Kurs suchen"
                />
              </div>
              {archivedCount > 0 && (
                <button type="button" className={`chip ${showArchived ? 'on' : ''}`} onClick={() => setShowArchived((v) => !v)}>
                  Archiv ({archivedCount})
                </button>
              )}
            </div>
          )}

          {!showArchived &&
            folders.map((f) => {
              const inside = decks.filter((d) => d.folderId === f.id);
              const isClosed = closed[f.id];
              const isOver = overTarget === 'folder:' + f.id;
              return (
                <div
                  key={f.id}
                  className={`cfolder${isOver ? ' drag-over' : ''}`}
                  onDragOver={(e) => {
                    if (!dragDeckId) return;
                    e.preventDefault();
                    setOverTarget('folder:' + f.id);
                  }}
                  onDragLeave={() => isOver && setOverTarget(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropIntoFolder(f.id);
                  }}
                >
                  <div className="cfolder-head">
                    <button type="button" className="cfolder-toggle" onClick={() => setClosed((c) => ({ ...c, [f.id]: !c[f.id] }))}>
                      {isClosed ? <IconChevron size={14} /> : <IconChevronDown size={14} />}
                      <IconFolder size={16} />
                      <b>{f.name}</b>
                      <small className="muted">{inside.length}</small>
                    </button>
                    {studyButton(`Ordner: ${f.name}`, inside, (n) => (n ? `Lernen ${n}` : 'Üben'), 'btn ghost sm cfolder-study')}
                    <span className="cdeck-actions">
                      <button type="button" className="icon-btn" aria-label="Deck in diesem Ordner" title="Neues Deck in diesem Ordner" onClick={() => setDialog({ kind: 'deck', course, folderId: f.id })}>
                        <IconPlus size={14} />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Ordner umbenennen" onClick={() => setDialog({ kind: 'rename-folder', course, folder: f })}>
                        <IconEdit size={14} />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Ordner löschen" onClick={() => undoable(`Ordner „${f.name}“ entfernt – die Decks bleiben im Kurs`, () => deleteFolder(course.id, f.id))}>
                        <IconTrash size={14} />
                      </button>
                    </span>
                  </div>
                  {!isClosed && (
                    <div className="cfolder-body">{inside.length ? inside.map(deckRow) : <p className="muted small">Leer – ziehe Decks per Drag &amp; Drop hierher.</p>}</div>
                  )}
                </div>
              );
            })}
          <div
            className={`cdeck-loose-zone${overTarget === 'loose' ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              if (!dragDeckId) return;
              e.preventDefault();
              setOverTarget('loose');
            }}
            onDragLeave={() => overTarget === 'loose' && setOverTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              dropIntoFolder(undefined);
            }}
          >
            {loose.map(deckRow)}
            {dragDeckId && folders.length > 0 && <small className="muted cdeck-drop-hint">Hier ablegen, um aus Ordner zu lösen</small>}
          </div>
          {!decks.length && (
            <div className="empty">
              <Mascot mood="wave" size={84} />
              <b>{showArchived ? 'Keine archivierten Decks' : deckQuery ? 'Kein Deck gefunden' : 'Noch keine Decks'}</b>
              {!showArchived && !deckQuery && (
                <>
                  <p className="muted">Lade deine Modul-Dateien hoch oder lege direkt ein Deck an.</p>
                  <div className="row-gap" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'deck', course })}>
                      <IconPlus size={16} /> Neues Deck
                    </button>
                    <button type="button" className="btn outline" onClick={() => setView('docs')}>
                      <IconFolder size={15} /> Dateien hochladen
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
        )}

        {!phone && (
        <section className="panel course-preview">
          <div className="seg compact preview-switch" role="tablist" aria-label="Ansicht">
            <button type="button" role="tab" aria-selected={view === 'deck'} className={view === 'deck' ? 'on' : ''} onClick={() => setView('deck')}>
              Kartendeck
            </button>
            <button type="button" role="tab" aria-selected={view === 'docs'} className={view === 'docs' ? 'on' : ''} onClick={() => setView('docs')}>
              Material{docCount > 0 ? ` (${docCount})` : ''}
            </button>
            <button type="button" role="tab" aria-selected={view === 'skills'} className={view === 'skills' ? 'on' : ''} onClick={() => setView('skills')}>
              Skills{skillCount > 0 ? ` (${skillCount})` : ''}
            </button>
            <button type="button" role="tab" aria-selected={view === 'graph'} className={view === 'graph' ? 'on' : ''} onClick={() => setView('graph')}>
              Wissens-Graph
            </button>
          </div>
          {view === 'docs' ? (
            <CourseDocs course={course} />
          ) : view === 'skills' ? (
            <CourseSkills course={course} onOpenMaterial={() => setView('docs')} />
          ) : view === 'graph' ? (
            <KnowledgeGraphView courseId={course.id} />
          ) : deck ? (
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
            <CourseDocs course={course} />
          )}
        </section>
        )}
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
