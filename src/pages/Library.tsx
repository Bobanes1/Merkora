import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CreateWithAI } from '../components/CreateWithAI';
import { NewDeckModal } from '../components/NewDeck';
import { IconCards, IconEdit, IconFolder, IconPlus, IconSparkle, IconTrash } from '../components/Icons';
import { ConfirmModal, PromptModal } from '../components/Modal';
import {
  addCourse,
  addDeck,
  addWorkspace,
  deckUrl,
  deleteCourse,
  deleteDeck,
  deleteWorkspace,
  dueCards,
  renameCourse,
  renameWorkspace,
  updateDeck,
  useData,
  type Course,
  type Workspace,
} from '../lib/store';
import { masteryPercent } from '../lib/stats';
import { uniqueSlug } from '../lib/util';

type Dialog =
  | { kind: 'ws' }
  | { kind: 'course'; ws: Workspace }
  | { kind: 'deck'; course: Course }
  | { kind: 'rename-ws'; ws: Workspace }
  | { kind: 'rename-course'; course: Course }
  | { kind: 'rename-deck'; id: string; name: string }
  | { kind: 'del-ws'; ws: Workspace }
  | { kind: 'del-course'; course: Course }
  | { kind: 'del-deck'; id: string; name: string }
  | null;

export default function Library() {
  const { ws, course } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [create, setCreate] = useState<{ courseId?: string } | null>(null);

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

  const deckRows = (c: Course) => {
    const decks = data.decks.filter((d) => d.courseId === c.id);
    if (!decks.length) return <p className="muted small">Noch keine Decks in diesem Kurs.</p>;
    return (
      <div className="deck-list">
        {decks.map((d) => {
          const pct = masteryPercent(d.cards);
          const n = dueCards(d).length;
          return (
            <div key={d.id} className="deck-row">
              <Link to={deckUrl(data, d)} className="deck-row-link">
                <span className="deck-icon">
                  <IconCards />
                </span>
                <span className="deck-info">
                  <b>{d.name}</b>
                  <small>{d.cards.length} Karten</small>
                </span>
                <span className="deck-progress">
                  <span className="bar">
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <small>{pct}%</small>
                </span>
                {n > 0 ? <span className="pill-count">{n} fällig</span> : <span className="pill-ok">erledigt</span>}
              </Link>
              <button type="button" className="icon-btn" aria-label="Deck umbenennen" onClick={() => setDialog({ kind: 'rename-deck', id: d.id, name: d.name })}>
                <IconEdit size={16} />
              </button>
              <button type="button" className="icon-btn" aria-label="Deck löschen" onClick={() => setDialog({ kind: 'del-deck', id: d.id, name: d.name })}>
                <IconTrash size={16} />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="page">
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
      <header className="page-head">
        <h1>{crs?.name ?? workspace?.name ?? 'Bibliothek'}</h1>
        <div className="row-gap">
          <button type="button" className="btn outline" onClick={() => setCreate({ courseId: crs?.id })}>
            <IconSparkle size={16} /> Mit KI erstellen
          </button>
          {crs ? (
            <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'deck', course: crs })}>
              <IconPlus size={16} /> Neues Deck
            </button>
          ) : workspace ? (
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

      {crs ? (
        <section className="panel">{deckRows(crs)}</section>
      ) : (
        shownWs.map((w) => (
          <section key={w.id} className="panel">
            <div className="panel-head">
              <h2>
                <IconFolder size={18} /> <Link to={`/library/${w.slug}`}>{w.name}</Link>
              </h2>
              <div className="row-gap">
                <button type="button" className="btn ghost sm" onClick={() => setDialog({ kind: 'course', ws: w })}>
                  <IconPlus size={14} /> Kurs
                </button>
                <button type="button" className="icon-btn" aria-label="Workspace umbenennen" onClick={() => setDialog({ kind: 'rename-ws', ws: w })}>
                  <IconEdit size={16} />
                </button>
                <button type="button" className="icon-btn" aria-label="Workspace löschen" onClick={() => setDialog({ kind: 'del-ws', ws: w })}>
                  <IconTrash size={16} />
                </button>
              </div>
            </div>
            {data.courses
              .filter((c) => c.workspaceId === w.id)
              .map((c) => (
                <div key={c.id} className="course-block">
                  <div className="panel-head">
                    <h3>
                      <Link to={`/library/${w.slug}/${c.slug}`}>{c.name}</Link>
                    </h3>
                    <div className="row-gap">
                      <button type="button" className="btn ghost sm" onClick={() => setDialog({ kind: 'deck', course: c })}>
                        <IconPlus size={14} /> Deck
                      </button>
                      <button type="button" className="icon-btn" aria-label="Kurs umbenennen" onClick={() => setDialog({ kind: 'rename-course', course: c })}>
                        <IconEdit size={16} />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Kurs löschen" onClick={() => setDialog({ kind: 'del-course', course: c })}>
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </div>
                  {deckRows(c)}
                </div>
              ))}
            {!data.courses.some((c) => c.workspaceId === w.id) && <p className="muted small">Noch keine Kurse.</p>}
          </section>
        ))
      )}

      {dialog?.kind === 'ws' && (
        <PromptModal title="Neuer Workspace" label="Name" confirm="Erstellen" onClose={() => setDialog(null)} onSubmit={(v) => addWorkspace(v)} />
      )}
      {dialog?.kind === 'course' && (
        <PromptModal title="Neuer Kurs" label="Name des Kurses" confirm="Erstellen" onClose={() => setDialog(null)} onSubmit={(v) => addCourse(dialog.ws.id, v)} />
      )}
      {dialog?.kind === 'deck' && (
        <NewDeckModal course={dialog.course} onClose={() => setDialog(null)} onAi={() => setCreate({ courseId: dialog.course.id })} />
      )}
      {dialog?.kind === 'rename-ws' && (
        <PromptModal title="Workspace umbenennen" label="Name" initial={dialog.ws.name} onClose={() => setDialog(null)} onSubmit={(v) => renameWorkspace(dialog.ws.id, v)} />
      )}
      {dialog?.kind === 'rename-course' && (
        <PromptModal title="Kurs umbenennen" label="Name" initial={dialog.course.name} onClose={() => setDialog(null)} onSubmit={(v) => renameCourse(dialog.course.id, v)} />
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
      {dialog?.kind === 'del-deck' && (
        <ConfirmModal title="Deck löschen?" text={`„${dialog.name}“ mit allen Karten wird gelöscht.`} onClose={() => setDialog(null)} onConfirm={() => deleteDeck(dialog.id)} />
      )}
      {create && <CreateWithAI courseId={create.courseId} onClose={() => setCreate(null)} />}
    </div>
  );
}
