import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { ExamDialog } from '../components/ExamDialog';
import { countdownText, nextExamForDeck } from '../lib/exams';
import { IconCalendar, IconCards, IconChart, IconChat, IconCheck, IconDoc, IconMatch, IconMindmap, IconNote, IconPath, IconPlay, IconQuiz, IconTarget } from '../components/Icons';
import { PromptModal } from '../components/Modal';
import MatchTab from './tabs/MatchTab';
import PathTab from './tabs/PathTab';
import { addTodo, dueCards, findPath, useData } from '../lib/store';
import CardsTab from './tabs/CardsTab';
import LearnTab from './tabs/LearnTab';
import MasteryTab from './tabs/MasteryTab';
import QuizTab from './tabs/QuizTab';
import ExamTab from './tabs/ExamTab';
import SourceTab from './tabs/SourceTab';
import SummaryTab from './tabs/SummaryTab';
import MindmapTab from './tabs/MindmapTab';

const TABS = [
  { id: 'cards', label: 'Karteikarten', icon: IconCards, group: 'Lernen' },
  { id: 'learn', label: 'Lernen', icon: IconPlay, group: 'Lernen' },
  { id: 'mastery', label: 'Fortschritt', icon: IconChart, group: 'Lernen' },
  { id: 'path', label: 'Lernpfad', icon: IconPath, group: 'Üben' },
  { id: 'match', label: 'Zuordnen', icon: IconMatch, group: 'Üben' },
  { id: 'quiz', label: 'Quiz', icon: IconQuiz, group: 'Üben' },
  { id: 'exam', label: 'Probeprüfung', icon: IconTarget, group: 'Üben' },
  { id: 'summary', label: 'Zusammenfassung', icon: IconDoc, group: 'Verstehen' },
  { id: 'mindmap', label: 'Mindmap', icon: IconMindmap, group: 'Verstehen' },
  { id: 'source', label: 'Material', icon: IconNote, group: 'Verstehen' },
] as const;
const GROUPS = ['Lernen', 'Üben', 'Verstehen'] as const;
type TabId = (typeof TABS)[number]['id'];

export default function DeckPage() {
  const { ws, course, deck: deckSlug } = useParams();
  const data = useData();
  const [params, setParams] = useSearchParams();
  const [chat, setChat] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280);
  const { workspace, course: crs, deck } = findPath(data, ws, course, deckSlug);
  const tabParam = params.get('tab') as TabId | null;
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'cards';
  const setTab = (t: TabId) => setParams({ tab: t });
  const [examDialog, setExamDialog] = useState(false);
  const [todoDialog, setTodoDialog] = useState(false);
  // the tab bar scrolls sideways on narrow windows: keep the open tab in view
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabsRef.current?.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

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
        <div className="deck-top">
          <nav className="crumbs" aria-label="Pfad">
            <Link to={`/library/${workspace.slug}`}>{workspace.name}</Link>
            <span>›</span>
            <Link to={`/library/${workspace.slug}/${crs.slug}`}>{crs.name}</Link>
            <span>›</span>
            <span className="crumb-current" title={deck.name}>
              {deck.name}
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
        <div className="tabs tab-groups" role="tablist" ref={tabsRef}>
          {GROUPS.map((g) => (
            <div key={g} className="tab-group" role="presentation">
              <small className="tab-group-label">{g}</small>
              <div className="tab-group-row">
                {TABS.filter((t) => t.group === g).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={`tab ${tab === t.id ? 'on' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    <t.icon size={16} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="tab-body">
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
