import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { ExamDialog } from '../components/ExamDialog';
import { countdownText, nextExamForDeck } from '../lib/exams';
import { IconCalendar, IconCards, IconChart, IconChat, IconCheck, IconDoc, IconMatch, IconMindmap, IconNote, IconPath, IconPlay, IconQuiz, IconTarget } from '../components/Icons';
import { PromptModal } from '../components/Modal';
import MatchTab from './tabs/MatchTab';
import PathTab from './tabs/PathTab';
import { addTodo, dueCards, findPath, useData } from '../lib/store';
import { shortName } from '../lib/deckNames';
import { usePhone } from '../lib/phone';
import { Sheet } from '../components/Sheet';
import CardsTab from './tabs/CardsTab';
import LearnTab from './tabs/LearnTab';
import MasteryTab from './tabs/MasteryTab';
import QuizTab from './tabs/QuizTab';
import ExamTab from './tabs/ExamTab';
import SourceTab from './tabs/SourceTab';
import SummaryTab from './tabs/SummaryTab';
import MindmapTab from './tabs/MindmapTab';
import OverviewTab from './tabs/OverviewTab';

const TABS = [
  { id: 'cards', label: 'Karten', icon: IconCards, group: 'Lernen' },
  { id: 'learn', label: 'Lernen', icon: IconPlay, group: 'Lernen' },
  { id: 'path', label: 'Lernpfad', icon: IconPath, group: 'Üben' },
  { id: 'match', label: 'Zuordnen', icon: IconMatch, group: 'Üben' },
  { id: 'quiz', label: 'Quiz', icon: IconQuiz, group: 'Üben' },
  { id: 'exam', label: 'Prüfung üben', icon: IconTarget, group: 'Üben' },
  { id: 'summary', label: 'Zusammenfassung', icon: IconDoc, group: 'Verstehen' },
  { id: 'mindmap', label: 'Mindmap', icon: IconMindmap, group: 'Verstehen' },
] as const;
const GROUPS = ['Lernen', 'Üben', 'Verstehen'] as const;
/** Phone: "Übersicht" plus these two tabs stay visible, everything else is under "Mehr". */
const PHONE_TABS = ['cards', 'learn'] as const;
/** Progress and material live inside "Lernen" (switch on top) – their addresses stay valid. */
const LEARN_VIEWS = [
  { id: 'learn', label: 'Lernen', icon: IconPlay },
  { id: 'mastery', label: 'Fortschritt', icon: IconChart },
  { id: 'source', label: 'Material', icon: IconNote },
] as const;
type TabId = (typeof TABS)[number]['id'] | 'mastery' | 'source' | 'overview';
const VALID: string[] = [...TABS.map((t) => t.id), 'mastery', 'source', 'overview'];

export default function DeckPage() {
  const { ws, course, deck: deckSlug } = useParams();
  const data = useData();
  const [params, setParams] = useSearchParams();
  const [chat, setChat] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280 && !document.documentElement.classList.contains('phone'));
  const { workspace, course: crs, deck } = findPath(data, ws, course, deckSlug);
  const tabParam = params.get('tab') as TabId | null;
  // phone: a deck opens on its overview with all modes; on the PC on the card list
  const phone = usePhone();
  const tab: TabId = tabParam && VALID.includes(tabParam) && !(tabParam === 'overview' && !phone) ? tabParam : phone ? 'overview' : 'cards';
  const barTab = tab === 'mastery' || tab === 'source' ? 'learn' : tab;
  const setTab = (t: TabId) => setParams({ tab: t });
  const [examDialog, setExamDialog] = useState(false);
  const [todoDialog, setTodoDialog] = useState(false);
  const [moreTabs, setMoreTabs] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (deck) document.title = `${deck.name} – Merkora`;
  }, [deck]);

  if (!deck || !workspace || !crs)
    return (
      <div className="page">
        <h1>Deck nicht gefunden</h1>
        <p className="muted">Dieses Deck gibt es auf diesem Gerät nicht (mehr).</p>
        <Link className="btn primary" to="/library">
          Zur Bibliothek
        </Link>
      </div>
    );

  const due = dueCards(deck).length;
  const exam = nextExamForDeck(data, deck.id);
  const todos = (data.todos ?? []).filter((t) => t.deckId === deck.id && !t.doneAt).length;

  return (
    <div className={`deck-layout ${chat ? 'with-chat' : ''}`}>
      <div className="deck-main">
        {phone ? (
          <div className="deck-top phone-deck-top">
            <Link to={`/library/${workspace.slug}/${crs.slug}`} className="icon-btn" aria-label={`Zurück zu ${crs.name}`}>
              ‹
            </Link>
            <b className="phone-deck-name" title={deck.name}>
              {shortName(deck, data.decks.filter((d) => d.courseId === deck.courseId))}
            </b>
            <button type="button" className="icon-btn" aria-label="Weitere Aktionen" onClick={() => setMenu(true)}>
              ⋮
            </button>
          </div>
        ) : (
        <div className="deck-top">
          <nav className="crumbs" aria-label="Pfad">
            <Link to={`/library/${workspace.slug}`}>{workspace.name}</Link>
            <span>›</span>
            <Link to={`/library/${workspace.slug}/${crs.slug}`}>{crs.name}</Link>
            <span>›</span>
            <span className="crumb-current" title={deck.name}>
              {shortName(deck, data.decks.filter((d) => d.courseId === deck.courseId))}
            </span>
          </nav>
          <div className="deck-actions">
            {exam ? (
              <Link to="/calendar" className="exam-chip" title={`${exam.title} · zu den Prüfungen`}>
                <IconCalendar size={14} /> {countdownText(exam)}
              </Link>
            ) : (
              <button type="button" className="btn ghost sm" onClick={() => setExamDialog(true)} title="Prüfung mit diesem Deck verknüpfen">
                <IconCalendar size={14} /> Prüfung
              </button>
            )}
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setTodoDialog(true)}
              title={todos ? `${todos} offene${todos === 1 ? 's' : ''} To-do${todos === 1 ? '' : 's'} – auf der Startseite` : 'To-do zu diesem Deck anlegen'}
            >
              <IconCheck size={14} /> {todos ? `${todos} To-do${todos === 1 ? '' : 's'}` : 'To-do'}
            </button>
            <button type="button" className={`btn ${chat ? 'soft' : 'ghost'} sm`} aria-pressed={chat} onClick={() => setChat(!chat)}>
              <IconChat size={15} /> Tutor
            </button>
            <button type="button" className="btn primary sm" onClick={() => setTab('learn')}>
              <IconPlay size={12} /> Lernen{due > 0 ? ` (${due})` : ''}
            </button>
          </div>
        </div>
        )}
        {phone ? (
          <div className="tabs phone-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'overview'} className={`tab ${tab === 'overview' ? 'on' : ''}`} onClick={() => setTab('overview')}>
              <span>Übersicht</span>
            </button>
            {TABS.filter((t) => (PHONE_TABS as readonly string[]).includes(t.id)).map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={barTab === t.id} className={`tab ${barTab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
                <span>{t.label}</span>
              </button>
            ))}
            {(() => {
              const other = [...TABS.filter((t) => !(PHONE_TABS as readonly string[]).includes(t.id)), ...LEARN_VIEWS.filter((v) => v.id !== 'learn')].find((t) => t.id === tab);
              return (
                <button type="button" className={`tab ${other ? 'on' : ''}`} aria-expanded={moreTabs} onClick={() => setMoreTabs(true)}>
                  <span>{other ? other.label : 'Mehr'} ▾</span>
                </button>
              );
            })()}
          </div>
        ) : (
        <div className="tabs tab-groups" role="tablist">
          {GROUPS.map((g) => (
            <div key={g} className="tab-group" role="presentation" aria-label={g}>
              {TABS.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={barTab === t.id}
                  className={`tab ${barTab === t.id ? 'on' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  <t.icon size={14} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        )}
        {barTab === 'learn' && !phone && (
          <div className="seg compact learn-switch" role="radiogroup" aria-label="Ansicht">
            {LEARN_VIEWS.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={tab === v.id} className={tab === v.id ? 'on' : ''} onClick={() => setTab(v.id)}>
                <v.icon size={13} /> {v.label}
              </button>
            ))}
          </div>
        )}
        <div className="tab-body">
          {tab === 'overview' && <OverviewTab deck={deck} onOpen={(t) => setTab(t as TabId)} />}
          {tab === 'cards' && <CardsTab deck={deck} onLearn={() => setTab('learn')} />}
          {tab === 'learn' && <LearnTab deck={deck} onDone={() => setTab('mastery')} />}
          {tab === 'path' && <PathTab key={deck.id} deck={deck} />}
          {tab === 'match' && <MatchTab key={deck.id} deck={deck} />}
          {tab === 'mastery' && <MasteryTab deck={deck} reviews={data.reviews.filter((r) => r.deckId === deck.id)} onLearn={() => setTab('learn')} onProblems={() => setParams({ tab: 'cards', filter: 'leech' })} />}
          {tab === 'summary' && <SummaryTab deck={deck} />}
          {tab === 'mindmap' && <MindmapTab deck={deck} onCards={(term) => setParams({ tab: 'cards', q: term })} />}
          {tab === 'quiz' && <QuizTab deck={deck} />}
          {tab === 'exam' && <ExamTab deck={deck} />}
          {tab === 'source' && <SourceTab deck={deck} />}
        </div>
      </div>
      {phone && tab !== 'learn' && tab !== 'overview' && (
        <button type="button" className="btn primary phone-learn" onClick={() => setTab('learn')}>
          <IconPlay size={14} /> Lernen{due > 0 ? ` (${due})` : ''}
        </button>
      )}
      {phone && moreTabs && (
        <Sheet title="Weitere Ansichten" onClose={() => setMoreTabs(false)}>
          <div className="sheet-list">
            {[...TABS.filter((t) => !(PHONE_TABS as readonly string[]).includes(t.id)), ...LEARN_VIEWS.filter((v) => v.id !== 'learn')].map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => (setMoreTabs(false), setTab(t.id as TabId))}>
                <t.icon size={20} /> {t.label}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {phone && menu && (
        <Sheet title={deck.name} onClose={() => setMenu(false)}>
          <div className="sheet-list">
            <button type="button" onClick={() => (setMenu(false), setChat(true))}>
              <IconChat size={20} /> Tutor Pip fragen
            </button>
            <button type="button" onClick={() => (setMenu(false), setTodoDialog(true))}>
              <IconCheck size={20} /> {todos ? `To-dos (${todos} offen) – neues anlegen` : 'To-do anlegen'}
            </button>
            {exam ? (
              <Link to="/calendar" onClick={() => setMenu(false)}>
                <IconCalendar size={20} /> {exam.title} · {countdownText(exam)}
              </Link>
            ) : (
              <button type="button" onClick={() => (setMenu(false), setExamDialog(true))}>
                <IconCalendar size={20} /> Prüfung verknüpfen
              </button>
            )}
          </div>
        </Sheet>
      )}
      {chat && <ChatPanel deck={deck} onClose={() => setChat(false)} />}
      {examDialog && <ExamDialog presetDeckId={deck.id} onClose={() => setExamDialog(false)} />}
      {todoDialog && (
        <PromptModal
          title="To-do zu diesem Deck"
          label={`Was steht bei „${deck.name}“ an? (erscheint auf der Startseite)`}
          confirm="Hinzufügen"
          onSubmit={(text) => addTodo({ text, deckId: deck.id })}
          onClose={() => setTodoDialog(false)}
        />
      )}
    </div>
  );
}
