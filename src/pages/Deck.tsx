import { useCallback, useEffect, useRef, useState } from 'react';
import { CoverDialog, DeckCoverTile } from '../components/DeckCover';
import { DeckSettingsModal } from '../components/DeckSettingsModal';
import { Plant } from '../components/Plant';
import { coverOf } from '../lib/look';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { ExamDialog } from '../components/ExamDialog';
import { countdownText, nextExamForDeck } from '../lib/exams';
import { estimateStudyMinutes, formatEstMinutes } from '../lib/deckTools';
import { IconBulb, IconCalendar, IconCards, IconChart, IconChat, IconDoc, IconHeadphones, IconMatch, IconMindmap, IconNote, IconPath, IconPlay, IconPractice, IconQuiz, IconSettings, IconTarget } from '../components/Icons';
import MatchTab from './tabs/MatchTab';
import PathTab from './tabs/PathTab';
import { dueCards, findPath, setSettings, useData } from '../lib/store';
import { shortName } from '../lib/deckNames';
import { masteryPercent } from '../lib/stats';
import { usePhone } from '../lib/phone';
import { Sheet } from '../components/Sheet';
import { Mascot } from '../components/Mascot';
import CardsTab from './tabs/CardsTab';
import LearnTab from './tabs/LearnTab';
import MasteryTab from './tabs/MasteryTab';
import QuizTab from './tabs/QuizTab';
import PracticeTab from './tabs/PracticeTab';
import ExamTab from './tabs/ExamTab';
import SourceTab from './tabs/SourceTab';
import SummaryTab from './tabs/SummaryTab';
import MindmapTab from './tabs/MindmapTab';
import OverviewTab from './tabs/OverviewTab';
import FeynmanTab from './tabs/FeynmanTab';
import PodcastTab from './tabs/PodcastTab';

const TABS = [
  { id: 'cards', label: 'Karten', icon: IconCards, group: 'Lernen' },
  { id: 'learn', label: 'Lernen', icon: IconPlay, group: 'Lernen' },
  { id: 'path', label: 'Lernpfad', icon: IconPath, group: 'Üben' },
  { id: 'match', label: 'Zuordnen', icon: IconMatch, group: 'Üben' },
  { id: 'quiz', label: 'Quiz', icon: IconQuiz, group: 'Üben' },
  { id: 'practice', label: 'Aufgaben', icon: IconPractice, group: 'Üben' },
  { id: 'feynman', label: 'Erklären', icon: IconBulb, group: 'Üben' },
  { id: 'exam', label: 'Prüfung üben', icon: IconTarget, group: 'Üben' },
  { id: 'summary', label: 'Zusammenfassung', icon: IconDoc, group: 'Verstehen' },
  { id: 'podcast', label: 'Podcast', icon: IconHeadphones, group: 'Verstehen' },
  { id: 'mindmap', label: 'Mindmap', icon: IconMindmap, group: 'Verstehen' },
  { id: 'source', label: 'Material', icon: IconNote, group: 'Verstehen' },
] as const;
const GROUPS = ['Lernen', 'Üben', 'Verstehen'] as const;
/** Phone: "Übersicht" plus these two tabs stay visible, everything else is under "Mehr". */
const PHONE_TABS = ['cards', 'learn'] as const;
/** Progress lives inside "Lernen" (switch on top) – and is reachable from the header ring. */
const LEARN_VIEWS = [
  { id: 'learn', label: 'Lernen', icon: IconPlay },
  { id: 'mastery', label: 'Fortschritt', icon: IconChart },
] as const;
type TabId = (typeof TABS)[number]['id'] | 'mastery' | 'overview';
const VALID: string[] = [...TABS.map((t) => t.id), 'mastery', 'overview'];

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
  const barTab = tab === 'mastery' ? 'learn' : tab;
  const setTab = (t: TabId) => setParams({ tab: t });
  const [examDialog, setExamDialog] = useState(false);
  const [moreTabs, setMoreTabs] = useState(false);
  const [menu, setMenu] = useState(false);
  const [coverDialog, setCoverDialog] = useState(false);
  const [deckSettings, setDeckSettings] = useState(false);
  const [customRound, setCustomRound] = useState<{ ids: string[]; label: string } | null>(null);
  // the tab bar scrolls sideways when it does not fit: a soft fade on the right shows there is more
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const checkTabs = useCallback(() => {
    const t = tabsRef.current;
    setTabsOverflow(!!t && t.scrollWidth - t.clientWidth - t.scrollLeft > 4);
  }, []);
  useEffect(() => {
    const t = tabsRef.current;
    if (!t || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(checkTabs);
    ro.observe(t);
    checkTabs();
    return () => ro.disconnect();
  }, [checkTabs, deck?.id, phone]);

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
  const deckReviews = data.reviews.filter((r) => r.deckId === deck.id);
  const est = due > 0 ? formatEstMinutes(estimateStudyMinutes(due, deckReviews)) : '';
  const exam = nextExamForDeck(data, deck.id);

  const launchCustom = (ids: string[], label: string) => {
    setCustomRound({ ids, label });
    setTab('learn');
  };

  return (
    <div className={`deck-layout ${chat ? 'with-chat' : ''}`} data-mode={tab === 'overview' ? undefined : tab}>
      <div className="deck-main">
        {phone ? (
          <div className="deck-top phone-deck-top">
            <Link to={`/library/${workspace.slug}/${crs.slug}`} className="icon-btn" aria-label={`Zurück zu ${crs.name}`}>
              ‹
            </Link>
            <DeckCoverTile cover={coverOf(deck)} size={26} onClick={() => setCoverDialog(true)} />
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
            <Link to={`/library/${workspace.slug}/${crs.slug}`} title={`${workspace.name} › ${crs.name}`}>
              ‹ <span className="crumb-course">{crs.name}</span>
            </Link>
            <span className="crumb-sep">›</span>
            <DeckCoverTile cover={coverOf(deck)} size={26} onClick={() => setCoverDialog(true)} />
            <span className="crumb-current" title={deck.name}>
              {shortName(deck, data.decks.filter((d) => d.courseId === deck.courseId))}
            </span>
            {deck.archived && <span className="badge">Archiviert</span>}
          </nav>
          <div className="deck-actions">
            <button type="button" className="mastery-chip" onClick={() => setTab('mastery')} title="Fortschritt ansehen">
              <Plant pct={masteryPercent(deck.cards)} size={22} /> {masteryPercent(deck.cards)} %
            </button>
            {(deck.files?.length ?? 0) > 0 && (
              <button type="button" className="files-chip" onClick={() => setTab('source')} title="Deine Dateien ansehen">
                <IconNote size={14} /> {deck.files!.length} {deck.files!.length === 1 ? 'Datei' : 'Dateien'}
              </button>
            )}
            {exam ? (
              <Link to="/tools?tab=exams" className="exam-chip" title={`${exam.title} · zu den Prüfungen`}>
                <IconCalendar size={14} /> {countdownText(exam)}
              </Link>
            ) : (
              <button type="button" className="btn ghost sm" onClick={() => setExamDialog(true)} title="Prüfung mit diesem Deck verknüpfen">
                <IconCalendar size={14} /> <span className="act-label">Prüfung</span>
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="Deck-Einstellungen" title="Deck-Einstellungen (Limits, Duplizieren, Zusammenführen, Archiv)" onClick={() => setDeckSettings(true)}>
              <IconSettings size={16} />
            </button>
            <button type="button" className={`btn ${chat ? 'soft' : 'ghost'} sm`} aria-pressed={chat} aria-label="Tutor" title="Tutor Pip" onClick={() => setChat(!chat)}>
              <IconChat size={15} /> <span className="act-label">Tutor</span>
            </button>
            <button type="button" className="btn primary sm" onClick={() => (setCustomRound(null), setTab('learn'))} title={est ? `Geschätzte Lernzeit: ${est}` : undefined}>
              <IconPlay size={12} /> Lernen{due > 0 ? ` (${due}${est ? ` · ${est}` : ''})` : ''}
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
              <button key={t.id} type="button" role="tab" aria-selected={barTab === t.id} className={`tab mode-${t.id} ${barTab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
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
        <div className={`tabs tab-groups${tabsOverflow ? ' overflowing' : ''}`} role="tablist" ref={tabsRef} onScroll={checkTabs}>
          {GROUPS.map((g) => (
            <div key={g} className="tab-group" role="presentation" aria-label={g}>
              {TABS.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={barTab === t.id}
                  className={`tab mode-${t.id} ${barTab === t.id ? 'on' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  <t.icon size={14} />
                  <span>
                    {t.label}
                    {t.id === 'source' && (deck.files?.length ?? 0) > 0 ? ` (${deck.files!.length})` : ''}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
        )}
        {barTab === 'learn' && !phone && (
          <div className="seg compact learn-switch" role="radiogroup" aria-label="Ansicht">
            {LEARN_VIEWS.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={tab === v.id} className={`mode-${v.id} ${tab === v.id ? 'on' : ''}`} onClick={() => setTab(v.id)}>
                <v.icon size={13} /> {v.label}
              </button>
            ))}
          </div>
        )}
        {!data.settings.seenDeckTip && (
          <div className="deck-tip" role="status">
            <Mascot who="pip" mood="wave" size={44} />
            <span className="grow">
              {phone
                ? 'Hier findest du alle Modi: Lernen, Karten, Lernpfad, Quiz, Prüfung üben, Zusammenfassung, Mindmap und deine Dateien unter „Material“.'
                : 'Oben findest du alle Modi: Lernen und Üben (Lernpfad, Zuordnen, Quiz, Prüfung üben) und Verstehen (Zusammenfassung, Mindmap, Material mit deinen Dateien).'}
            </span>
            <button type="button" className="btn ghost sm" onClick={() => setSettings({ seenDeckTip: true })}>
              Verstanden
            </button>
          </div>
        )}
        <div className="tab-body">
          {tab === 'overview' && <OverviewTab deck={deck} onOpen={(t) => setTab(t as TabId)} />}
          {tab === 'cards' && <CardsTab deck={deck} onLearn={() => (setCustomRound(null), setTab('learn'))} onPracticeIds={launchCustom} />}
          {tab === 'learn' && <LearnTab deck={deck} onDone={() => setTab('mastery')} customRound={customRound} onClearCustom={() => setCustomRound(null)} />}
          {tab === 'path' && <PathTab key={deck.id} deck={deck} />}
          {tab === 'match' && <MatchTab key={deck.id} deck={deck} />}
          {tab === 'mastery' && (
            <MasteryTab
              deck={deck}
              reviews={deckReviews}
              onLearn={() => (setCustomRound(null), setTab('learn'))}
              onProblems={() => setParams({ tab: 'cards', filter: 'leech' })}
              onPracticeIds={launchCustom}
            />
          )}
          {tab === 'summary' && <SummaryTab deck={deck} />}
          {tab === 'podcast' && <PodcastTab key={deck.id} deck={deck} />}
          {tab === 'mindmap' && <MindmapTab deck={deck} onCards={(term) => setParams({ tab: 'cards', q: term })} />}
          {tab === 'quiz' && <QuizTab deck={deck} />}
          {tab === 'feynman' && <FeynmanTab key={deck.id} deck={deck} />}
          {tab === 'exam' && <ExamTab deck={deck} />}
          {tab === 'practice' && <PracticeTab deck={deck} />}
          {tab === 'source' && <SourceTab deck={deck} onStudyCards={launchCustom} />}
        </div>
      </div>
      {phone && tab !== 'learn' && tab !== 'overview' && (
        <button type="button" className="btn primary phone-learn" onClick={() => (setCustomRound(null), setTab('learn'))}>
          <IconPlay size={14} /> Lernen{due > 0 ? ` (${due})` : ''}
        </button>
      )}
      {phone && moreTabs && (
        <Sheet title="Weitere Ansichten" onClose={() => setMoreTabs(false)}>
          <div className="sheet-list">
            {[...TABS.filter((t) => !(PHONE_TABS as readonly string[]).includes(t.id)), ...LEARN_VIEWS.filter((v) => v.id !== 'learn')].map((t) => (
              <button key={t.id} type="button" className={`mode-${t.id} ${tab === t.id ? 'on' : ''}`} onClick={() => (setMoreTabs(false), setTab(t.id as TabId))}>
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
            <button type="button" onClick={() => (setMenu(false), setDeckSettings(true))}>
              <IconSettings size={20} /> Deck-Einstellungen
            </button>
            <button type="button" onClick={() => (setMenu(false), setCoverDialog(true))}>
              <DeckCoverTile cover={coverOf(deck)} size={22} /> Cover ändern
            </button>
            {exam ? (
              <Link to="/tools?tab=exams" onClick={() => setMenu(false)}>
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
      {coverDialog && <CoverDialog deck={deck} onClose={() => setCoverDialog(false)} />}
      {deckSettings && <DeckSettingsModal deck={deck} onClose={() => setDeckSettings(false)} />}
    </div>
  );
}
