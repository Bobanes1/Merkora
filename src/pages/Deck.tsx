import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { ExamDialog } from '../components/ExamDialog';
import { countdownText, nextExamForDeck } from '../lib/exams';
import { IconCalendar, IconCards, IconChart, IconChat, IconDoc, IconHeadphones, IconNote, IconPath, IconPlay, IconQuiz } from '../components/Icons';
import PathTab from './tabs/PathTab';
import { dueCards, findPath, useData } from '../lib/store';
import CardsTab from './tabs/CardsTab';
import LearnTab from './tabs/LearnTab';
import MasteryTab from './tabs/MasteryTab';
import PodcastTab from './tabs/PodcastTab';
import QuizTab from './tabs/QuizTab';
import SourceTab from './tabs/SourceTab';
import SummaryTab from './tabs/SummaryTab';

const TABS = [
  { id: 'cards', label: 'Karteikarten', icon: IconCards },
  { id: 'learn', label: 'Lernen', icon: IconPlay },
  { id: 'path', label: 'Lernpfad', icon: IconPath },
  { id: 'mastery', label: 'Lernfortschritt', icon: IconChart },
  { id: 'summary', label: 'Zusammenfassung', icon: IconDoc },
  { id: 'quiz', label: 'Quiz', icon: IconQuiz },
  { id: 'podcast', label: 'Podcast', icon: IconHeadphones },
  { id: 'source', label: 'Lernmaterial', icon: IconNote },
] as const;
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

  return (
    <div className={`deck-layout ${chat ? 'with-chat' : ''}`}>
      <div className="deck-main">
        <div className="deck-top">
          <nav className="crumbs" aria-label="Pfad">
            <Link to={`/library/${workspace.slug}`}>{workspace.name}</Link>
            <span>›</span>
            <Link to={`/library/${workspace.slug}/${crs.slug}`}>{crs.name}</Link>
            <span>›</span>
            <span className="crumb-current">{deck.name}</span>
          </nav>
          <div className="row-gap">
            {exam ? (
              <Link to="/calendar" className="exam-chip" title="Zum Kalender">
                <IconCalendar size={14} /> {exam.title} · {countdownText(exam)}
              </Link>
            ) : (
              <button type="button" className="btn ghost sm" onClick={() => setExamDialog(true)}>
                <IconCalendar size={14} /> Prüfung verknüpfen
              </button>
            )}
            <button type="button" className={`btn ${chat ? 'soft' : 'outline'} sm`} onClick={() => setChat(!chat)}>
              <IconChat size={15} /> Tutor
            </button>
            <button type="button" className="btn primary sm" onClick={() => setTab('learn')}>
              <IconPlay size={12} /> Lernen{due > 0 ? ` (${due})` : ''}
            </button>
          </div>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
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
        <div className="tab-body">
          {tab === 'cards' && <CardsTab deck={deck} onLearn={() => setTab('learn')} />}
          {tab === 'learn' && <LearnTab deck={deck} onDone={() => setTab('mastery')} />}
          {tab === 'path' && <PathTab key={deck.id} deck={deck} />}
          {tab === 'mastery' && <MasteryTab deck={deck} reviews={data.reviews.filter((r) => r.deckId === deck.id)} onLearn={() => setTab('learn')} />}
          {tab === 'summary' && <SummaryTab deck={deck} />}
          {tab === 'quiz' && <QuizTab deck={deck} />}
          {tab === 'podcast' && <PodcastTab deck={deck} />}
          {tab === 'source' && <SourceTab deck={deck} />}
        </div>
      </div>
      {chat && <ChatPanel deck={deck} onClose={() => setChat(false)} />}
      {examDialog && <ExamDialog presetDeckId={deck.id} onClose={() => setExamDialog(false)} />}
    </div>
  );
}
