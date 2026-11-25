import { useEffect, useState } from 'react';
import { Mascot } from '../../components/Mascot';
import { undoable } from '../../lib/undo';
import { useSearchParams } from 'react-router-dom';
import { ImproveCardDialog } from '../../components/ImproveCardDialog';
import { isLeech } from '../../lib/cardLinks';
import { swapSides } from '../../lib/askSide';
import { MoveCardsDialog } from '../../components/MoveCardsDialog';
import { RegenerateCardDialog } from '../../components/RegenerateCardDialog';
import { DuplicatesModal } from '../../components/DuplicatesModal';
import { QuickCardsTable } from '../../components/QuickCardsModal';
import { TextImportModal } from '../../components/TextImportModal';
import { createPortal } from 'react-dom';
import { AnkiImport } from '../../components/AnkiImport';
import { OcclusionEditor, type Embed } from '../../components/OcclusionEditor';
import { ExportDialog } from '../../components/ExportDialog';
import { allTags, hasTag, parseTags } from '../../lib/tags';
import { answerOnly } from '../../lib/backSide';
import { MarkButton } from '../../components/MarkButton';
import { GraphicDialog } from '../../components/GraphicDialog';
import { CardContent, lookOf } from '../../components/CardContent';
import { CreateWithAI } from '../../components/CreateWithAI';
import {
  IconBulb,
  IconEdit,
  IconPause,
  IconPlay,
  IconPlus,
  IconSearch,
  IconSparkle,
  IconTrash,
  IconDownload,
  IconImage,
  IconTag,
  IconUpload,
  IconStar,
  IconRefresh,
} from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { ConfirmModal, Modal } from '../../components/Modal';
import { RichField } from '../../components/RichField';
import { cardBackText, cardFrontText, htmlToText, textToHtml } from '../../lib/content';
import {
  findDuplicateGroups,
  matchesCardStatus,
  sortCardList,
  type CardSort,
  type CardStatusFilter,
} from '../../lib/deckTools';
import { LEVELS, levelOf } from '../../lib/srs';
import {
  addCards,
  bulkDeleteCards,
  bulkResetCards,
  bulkUpdateCards,
  deleteCard,
  toggleSuspendCard,
  updateCard,
  type Card,
  type Deck,
} from '../../lib/store';
import { formatDue } from '../../lib/util';

const STATUS_CHIPS: { id: CardStatusFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'new', label: 'Neu' },
  { id: 'due', label: 'Fällig' },
  { id: 'learning', label: 'Lernend' },
  { id: 'mastered', label: 'Gemeistert' },
  { id: 'suspended', label: 'Pausiert' },
];

export function CardEditor({
  deck,
  card,
  onClose,
  onAnki,
  onTextImport,
  onRegenerate,
  embed,
}: {
  deck: Deck;
  card?: Card;
  onClose: () => void;
  onAnki?: () => void;
  onTextImport?: () => void;
  /** Existing card: open "Neu generieren" instead. */
  onRegenerate?: () => void;
  /** Inside the shared "Neue Karte" window (see NewCardWindow). */
  embed?: Embed;
}) {
  // The editor always works in HTML so pictures can be added; plain cards are converted.
  const toHtml = (s: string) => (card?.html ? s : textToHtml(s));
  const [front, setFront] = useState(card ? toHtml(card.front) : '');
  const [back, setBack] = useState(card ? toHtml(card.back) : '');
  const [hint, setHint] = useState(card?.hint ?? '');
  const [empty, setEmpty] = useState({ front: !card, back: !card });
  const [round, setRound] = useState(0);
  const [tagText, setTagText] = useState((card?.tags ?? []).join(' '));
  const ok = !empty.front && !empty.back;
  const save = (again: boolean) => {
    if (!ok) return;
    const tags = parseTags(tagText);
    const cleanHint = hint.trim() || undefined;
    if (card) updateCard(deck.id, card.id, { front, back, hint: cleanHint, html: true, tags: tags.length ? tags : undefined });
    else addCards(deck.id, [{ front, back, hint: cleanHint, html: true, tags }]);
    if (again) {
      setFront('');
      setBack('');
      setHint('');
      setEmpty({ front: true, back: true });
      setRound((r) => r + 1);
    } else onClose();
  };
  const insertCloze = () => {
    setFront((f) => f + ' {{Lücke}} ');
    setEmpty((e) => ({ ...e, front: false }));
    setRound((r) => r + 1);
  };
  const footer = (
    <>
      {card && onRegenerate && (
        <button type="button" className="btn ghost" onClick={onRegenerate} title="Die KI schreibt die Karte neu (Lernstand bleibt)">
          <IconSparkle size={15} /> Neu generieren
        </button>
      )}
      <span className="grow" />
      {!card && (
        <button type="button" className="btn ghost" onClick={() => save(true)} disabled={!ok}>
          Speichern &amp; nächste
        </button>
      )}
      <button type="button" className="btn primary" onClick={() => save(false)} disabled={!ok}>
        Speichern
      </button>
    </>
  );
  const body = (
    <>
      {!card && (onAnki || onTextImport) && (
        <div className="editor-alt">
          <IconUpload size={15} />
          <span>Schon fertige Karten?</span>
          {onAnki && (
            <button type="button" className="link-btn" onClick={onAnki}>
              Anki (.apkg)
            </button>
          )}
          {onAnki && onTextImport && <span>·</span>}
          {onTextImport && (
            <button type="button" className="link-btn" onClick={onTextImport}>
              CSV / Quizlet / Text
            </button>
          )}
        </div>
      )}
      <div className="swap-row">
        <button
          type="button"
          className="btn ghost sm"
          disabled={empty.front && empty.back}
          title="Vorder- und Rückseite vertauschen"
          onClick={() => {
            const s = swapSides(front, back, true);
            setFront(s.front);
            setBack(s.back);
            setEmpty((e) => ({ front: e.back, back: e.front }));
            setRound((r) => r + 1);
          }}
        >
          ⇄ Begriff und Definition tauschen
        </button>
        <button
          type="button"
          className="btn ghost sm"
          title="Fügt eine Lückentext-Markierung {{Lücke}} oder {{Lücke::Hinweis}} ein"
          onClick={insertCloze}
        >
          {'{{Lücke}}'} einfügen
        </button>
      </div>
      <div key={round}>
        <RichField
          id="card-front"
          label="Vorderseite (Frage – unterstützt {{Lücke}})"
          initialHtml={front}
          autoFocus
          onChange={(h, e) => {
            setFront(h);
            setEmpty((s) => ({ ...s, front: e }));
          }}
        />
        <RichField
          id="card-back"
          label="Rückseite (Antwort)"
          initialHtml={back}
          minHeight={110}
          contextText={() => htmlToText(front)}
          onChange={(h, e) => {
            setBack(h);
            setEmpty((s) => ({ ...s, back: e }));
          }}
        />
      </div>
      <label className="field-label" htmlFor="card-hint">
        Hinweis / Eselsbrücke (optional – vor dem Umdrehen aufklappbar)
      </label>
      <input
        id="card-hint"
        className="input"
        placeholder="z. B. Denke an die Anfangsbuchstaben …"
        value={hint}
        onChange={(e) => setHint(e.target.value)}
      />
      <label className="field-label" htmlFor="card-tags">
        Tags (optional)
      </label>
      <input
        id="card-tags"
        className="input"
        list="deck-tags"
        placeholder="z. B. Kapitel1 wichtig"
        value={tagText}
        onChange={(e) => setTagText(e.target.value)}
      />
      <datalist id="deck-tags">
        {allTags(deck.cards).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
  if (embed) return <>{body}{embed.footerEl && createPortal(footer, embed.footerEl)}</>;
  return (
    <Modal title={card ? 'Karte bearbeiten' : 'Neue Karte'} onClose={onClose} footer={footer}>
      {body}
    </Modal>
  );
}

/**
 * "Neue Karte": stays open while switching between Text & Bilder, Schnell-Tabelle, and Bildverdeckung.
 */
function NewCardWindow({ deck, onClose, onAnki, onTextImport }: { deck: Deck; onClose: () => void; onAnki: () => void; onTextImport: () => void }) {
  const [kind, setKind] = useState<'text' | 'table' | 'occl'>('text');
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);
  return (
    <Modal
      title="Neue Karte"
      className="new-card-modal"
      onClose={onClose}
      footer={<div ref={setFooterEl} className="footer-slot" />}
    >
      <div className="seg card-kind" role="tablist" aria-label="Art der Karte">
        <button type="button" role="tab" aria-selected={kind === 'text'} className={kind === 'text' ? 'on' : ''} onClick={() => setKind('text')}>
          Text &amp; Bilder
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'table'}
          className={kind === 'table' ? 'on' : ''}
          onClick={() => setKind('table')}
          title="Mehrere Karten schnell in einer Zwei-Spalten-Tabelle eintippen"
        >
          Schnell-Tabelle
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'occl'}
          className={kind === 'occl' ? 'on' : ''}
          onClick={() => setKind('occl')}
          title="Kästen über ein Bild ziehen – jede Stelle wird eine Karte"
        >
          Bildverdeckung
        </button>
      </div>
      {kind === 'text' ? (
        <CardEditor deck={deck} onClose={onClose} onAnki={onAnki} onTextImport={onTextImport} embed={{ footerEl }} />
      ) : kind === 'table' ? (
        <QuickCardsTable deck={deck} onClose={onClose} embed={{ footerEl }} />
      ) : (
        <OcclusionEditor deck={deck} onClose={onClose} embed={{ footerEl }} />
      )}
    </Modal>
  );
}

export default function CardsTab({
  deck,
  onLearn,
  onPracticeIds,
}: {
  deck: Deck;
  onLearn: () => void;
  onPracticeIds?: (ids: string[], label: string) => void;
}) {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [edit, setEdit] = useState<Card | 'new' | null>(null);
  const [del, setDel] = useState<Card | null>(null);
  const [graphic, setGraphic] = useState<Card | null>(null);
  const [regen, setRegen] = useState<Card | null>(null);
  const [ai, setAi] = useState(false);
  const term = q.trim().toLowerCase();
  const [anki, setAnki] = useState(false);
  const [textImport, setTextImport] = useState(false);
  const [showDups, setShowDups] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [limit, setLimit] = useState(100);
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState<CardStatusFilter>('all');
  const [sortBy, setSortBy] = useState<CardSort>('order');
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [onlyLeech, setOnlyLeech] = useState(params.get('filter') === 'leech');
  const [improve, setImprove] = useState<Card | null>(null);
  // multi-select bulk actions
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [moving, setMoving] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const [notice, setNotice] = useState('');
  // Esc leaves the selection
  useEffect(() => {
    if (!sel) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal') && setSel(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sel]);
  const toggleSel = (id: string) => setSel((s) => (s ? (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])) : s));
  const markedCount = deck.cards.filter((c) => c.marked).length;
  const leechCount = deck.cards.filter(isLeech).length;
  const suspendedCount = deck.cards.filter((c) => c.suspended).length;
  const dupGroups = findDuplicateGroups(deck.cards);
  const tags = allTags(deck.cards);
  const now = Date.now();
  const filtered = sortCardList(
    deck.cards.filter(
      (c) =>
        matchesCardStatus(c, status, now) &&
        (!tag || hasTag(c, tag)) &&
        (!onlyMarked || c.marked) &&
        (!onlyLeech || isLeech(c)) &&
        (!term || (cardFrontText(c) + ' ' + cardBackText(c) + ' ' + (c.hint ?? '') + ' ' + (c.tags ?? []).join(' ')).toLowerCase().includes(term)),
    ),
    sortBy,
  );
  const cards = filtered.slice(0, limit);
  const job = useJob(deck.id, 'cards');

  const selIds = sel ? [...sel] : [];
  const applyBulkTag = () => {
    const add = parseTags(bulkTag);
    if (!add.length || !selIds.length) return;
    bulkUpdateCards(deck.id, selIds, (c) => ({ tags: [...new Set([...(c.tags ?? []), ...add])] }));
    setNotice(`Tag ${add.map((t) => `#${t}`).join(' ')} zu ${selIds.length} Karten hinzugefügt.`);
    setBulkTag('');
  };
  const applyBulkSuspend = (suspend: boolean) => {
    if (!selIds.length) return;
    bulkUpdateCards(deck.id, selIds, () => ({ suspended: suspend ? true : undefined }));
    setNotice(`${selIds.length} Karten ${suspend ? 'pausiert' : 'wieder aktiviert'}.`);
    setSel(null);
  };
  const applyBulkMark = () => {
    if (!selIds.length) return;
    const allMarked = selIds.every((id) => deck.cards.find((c) => c.id === id)?.marked);
    bulkUpdateCards(deck.id, selIds, () => ({ marked: allMarked ? undefined : true }));
    setNotice(`${selIds.length} Karten ${allMarked ? 'entmarkiert' : 'markiert'}.`);
  };
  const applyBulkReset = () => {
    if (!selIds.length) return;
    undoable(`Lernstand von ${selIds.length} Karten zurückgesetzt`, () => bulkResetCards(deck.id, selIds));
    setSel(null);
  };
  const applyBulkDelete = () => {
    if (!selIds.length) return;
    undoable(`${selIds.length} Karten gelöscht`, () => bulkDeleteCards(deck.id, selIds));
    setSel(null);
  };

  return (
    <div className="cards-tab">
      <div className="toolbar">
        <b className="toolbar-title">{deck.cards.length} Karteikarten</b>
        <span className="grow" />
        <button type="button" className="btn outline sm" onClick={() => setAi(true)}>
          <IconSparkle size={15} /> Mit KI erstellen
        </button>
        <button type="button" className="btn outline sm" onClick={() => setEdit('new')}>
          <IconPlus size={15} /> Karte
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setTextImport(true)} title="CSV, Quizlet oder Textliste importieren">
          <IconUpload size={14} /> Import
        </button>
        {deck.cards.length > 1 && (
          <button type="button" className={'btn sm ' + (dupGroups.length ? 'outline' : 'ghost')} onClick={() => setShowDups(true)} title="Doppelte Vorderseiten finden und bereinigen">
            Duplikate{dupGroups.length ? ` (${dupGroups.length})` : ''}
          </button>
        )}
        <button
          type="button"
          className={'btn sm ' + (sel ? 'outline' : 'ghost')}
          onClick={() => setSel(sel ? null : new Set())}
          disabled={!deck.cards.length}
          aria-pressed={!!sel}
          title="Karten auswählen für Bulk-Aktionen (Taggen, Pausieren, Verschieben, Lernen, Löschen)"
        >
          {sel ? 'Abbrechen' : 'Auswählen'}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setExporting(true)} disabled={!deck.cards.length}>
          <IconDownload size={15} /> Export
        </button>
        <button type="button" className="btn primary sm toolbar-learn" onClick={onLearn} disabled={!deck.cards.length}>
          <IconPlay size={12} /> Lernen
        </button>
      </div>
      {sel && (
        <div className="select-bar bulk-bar" role="region" aria-label="Auswahl">
          <div className="bulk-row">
            <b>{sel.size === 1 ? '1 Karte ausgewählt' : `${sel.size} Karten ausgewählt`}</b>
            <button type="button" className="link-btn" onClick={() => setSel(new Set(filtered.map((c) => c.id)))}>
              {filtered.length === deck.cards.length ? 'Alle auswählen' : `Alle ${filtered.length} angezeigten`}
            </button>
            {sel.size > 0 && (
              <button type="button" className="link-btn" onClick={() => setSel(new Set())}>
                Keine
              </button>
            )}
            <span className="grow" />
            <button type="button" className="btn ghost sm" onClick={() => setSel(null)}>
              × Schließen
            </button>
          </div>
          {sel.size > 0 && (
            <div className="bulk-actions">
              {onPracticeIds && (
                <button type="button" className="btn primary sm" onClick={() => (onPracticeIds(selIds, `Auswahl (${selIds.length})`), setSel(null))}>
                  <IconPlay size={12} /> Auswahl lernen
                </button>
              )}
              <button type="button" className="btn outline sm" onClick={() => setMoving(true)}>
                Verschieben
              </button>
              <button type="button" className="btn ghost sm" onClick={applyBulkMark}>
                <IconStar size={12} /> Markieren
              </button>
              <button type="button" className="btn ghost sm" onClick={() => applyBulkSuspend(!selIds.every((id) => deck.cards.find((c) => c.id === id)?.suspended))}>
                <IconPause size={12} /> {selIds.every((id) => deck.cards.find((c) => c.id === id)?.suspended) ? 'Aktivieren' : 'Pausieren'}
              </button>
              <button type="button" className="btn ghost sm" onClick={applyBulkReset}>
                <IconRefresh size={12} /> Zurücksetzen
              </button>
              <button type="button" className="btn ghost sm danger" onClick={applyBulkDelete}>
                <IconTrash size={12} /> Löschen
              </button>
              <span className="bulk-tag-box">
                <input
                  className="input sm"
                  placeholder="+ Tag …"
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyBulkTag()}
                />
                <button type="button" className="btn outline sm" disabled={!bulkTag.trim()} onClick={applyBulkTag}>
                  Taggen
                </button>
              </span>
            </div>
          )}
        </div>
      )}
      {notice && (
        <div className="form-ok move-notice" role="status">
          {notice}
          <button type="button" className="icon-btn" aria-label="Hinweis schließen" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      {isActive(job) && job && <JobBanner job={job} />}
      <JobError job={job} />
      <div className="cards-filter-top">
        <div className="search grow">
          <IconSearch size={16} />
          <input placeholder="Karten, Hinweise oder Tags durchsuchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Karten durchsuchen" />
        </div>
        <select className="input sm cards-sort" aria-label="Sortieren" value={sortBy} onChange={(e) => setSortBy(e.target.value as CardSort)}>
          <option value="order">Sortierung: Standard</option>
          <option value="newest">Neueste zuerst</option>
          <option value="hardest">Schwierigste zuerst</option>
          <option value="due">Als Nächstes fällig</option>
          <option value="alpha">Alphabetisch (A–Z)</option>
        </select>
      </div>
      {deck.cards.length > 0 && (
        <div className="tag-filter" aria-label="Nach Status und Tag filtern">
          {STATUS_CHIPS.filter((s) => s.id !== 'suspended' || suspendedCount > 0).map((s) => (
            <button
              key={s.id}
              type="button"
              className={`tag ${status === s.id && !tag && !onlyMarked && !onlyLeech ? 'on' : status === s.id ? 'on' : ''}`}
              onClick={() => setStatus(s.id)}
            >
              {s.label}
              {s.id === 'suspended' ? ` (${suspendedCount})` : ''}
            </button>
          ))}
          {markedCount > 0 && (
            <button type="button" className={`tag mark-filter ${onlyMarked ? 'on' : ''}`} aria-pressed={onlyMarked} onClick={() => setOnlyMarked(!onlyMarked)}>
              <IconStar size={12} /> Markiert ({markedCount})
            </button>
          )}
          {leechCount > 0 && (
            <button
              type="button"
              className={`tag leech-filter ${onlyLeech ? 'on' : ''}`}
              aria-pressed={onlyLeech}
              title="Karten, die du immer wieder vergisst"
              onClick={() => setOnlyLeech(!onlyLeech)}
            >
              Problemkarten ({leechCount})
            </button>
          )}
          {tags.length > 0 && <IconTag size={14} />}
          {tags.slice(0, 30).map((t) => (
            <button key={t} type="button" className={`tag ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? '' : t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
      {deck.cards.length === 0 ? (
        <div className="empty">
          <Mascot mood="wave" size={84} />
          <b>Dieses Deck ist noch leer</b>
          <p className="muted">Lass die KI Karten aus deinem Lernmaterial erstellen, schreibe selbst welche oder importiere aus CSV, Quizlet oder Anki.</p>
          <div className="row-gap center">
            <button type="button" className="btn primary" onClick={() => setAi(true)}>
              <IconSparkle size={16} /> Mit KI erstellen
            </button>
            <button type="button" className="btn outline" onClick={() => setEdit('new')}>
              <IconPlus size={16} /> Karte schreiben
            </button>
            <button type="button" className="btn outline" onClick={() => setTextImport(true)}>
              <IconUpload size={16} /> CSV / Quizlet
            </button>
            <button type="button" className="btn outline" onClick={() => setAnki(true)}>
              <IconUpload size={16} /> Anki (.apkg)
            </button>
          </div>
        </div>
      ) : (
        <div className="card-list">
          {cards.map((c) => {
            const lvl = LEVELS.find((l) => l.id === levelOf(c.srs))!;
            return (
              <article
                key={c.id}
                className={'flash-row' + (sel ? ' selecting' : '') + (sel?.has(c.id) ? ' chosen' : '') + (c.suspended ? ' suspended' : '')}
                onClick={sel ? () => toggleSel(c.id) : undefined}
              >
                {sel && (
                  <input
                    type="checkbox"
                    className="row-check"
                    checked={sel.has(c.id)}
                    onChange={() => toggleSel(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Karte auswählen: ${cardFrontText(c).slice(0, 60)}`}
                  />
                )}
                <div className="flash-text">
                  <CardContent text={c.front} html={c.html} look={lookOf(deck, c)} className="ft-front" />
                  <CardContent text={c.html ? answerOnly(c.front, c.back) : c.back} html={c.html} look={lookOf(deck, c)} className="ft-back" />
                  {c.hint && (
                    <small className="card-hint-line">
                      <IconBulb size={12} /> {c.hint}
                    </small>
                  )}
                  {c.tags && c.tags.length > 0 && (
                    <div className="row-tags" title={c.tags.map((t) => `#${t}`).join(' ')}>
                      {c.tags.slice(0, 4).map((t) => (
                        <span key={t}>#{t}</span>
                      ))}
                      {c.tags.length > 4 && <span>+{c.tags.length - 4}</span>}
                    </div>
                  )}
                </div>
                <div className="flash-meta">
                  {c.suspended ? (
                    <span className="badge">Pausiert</span>
                  ) : (
                    <span className="level-badge" style={{ ['--c' as string]: lvl.color }}>
                      {lvl.label}
                    </span>
                  )}
                  {isLeech(c) && (
                    <button type="button" className="leech-badge" title={`${c.srs.lapses}× vergessen – Karte verbessern`} onClick={() => setImprove(c)}>
                      Problemkarte
                    </button>
                  )}

                  {!c.suspended && c.srs.last && <small>{formatDue(c.srs.due)}</small>}
                </div>
                <div className="flash-actions">
                  <MarkButton deckId={deck.id} card={c} />
                  <button
                    type="button"
                    className={'icon-btn' + (c.suspended ? ' on' : '')}
                    aria-label={c.suspended ? 'Karte wieder aktivieren' : 'Karte pausieren'}
                    title={c.suspended ? 'Wieder aktivieren' : 'Aus dem Lernplan pausieren (Suspend)'}
                    onClick={() => toggleSuspendCard(deck.id, c.id)}
                  >
                    <IconPause size={14} />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Neu generieren" title="Karte mit der KI neu generieren" onClick={() => setRegen(c)}>
                    <IconSparkle size={16} />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Grafik" title="Grafik erstellen, ersetzen oder entfernen" onClick={() => setGraphic(c)}>
                    <IconImage size={16} />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Bearbeiten" onClick={() => setEdit(c)}>
                    <IconEdit size={16} />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Löschen" onClick={() => undoable('Karte gelöscht', () => deleteCard(deck.id, c.id))}>
                    <IconTrash size={16} />
                  </button>
                </div>
              </article>
            );
          })}
          {cards.length === 0 && <p className="muted">Keine Karte passt zum aktuellen Filter.</p>}
          {filtered.length > cards.length && (
            <button type="button" className="btn outline" onClick={() => setLimit((n) => n + 200)}>
              Weitere Karten anzeigen ({filtered.length - cards.length})
            </button>
          )}
        </div>
      )}
      {edit === 'new' && (
        <NewCardWindow
          deck={deck}
          onClose={() => setEdit(null)}
          onAnki={() => {
            setEdit(null);
            setAnki(true);
          }}
          onTextImport={() => {
            setEdit(null);
            setTextImport(true);
          }}
        />
      )}
      {edit && edit !== 'new' && (
        <CardEditor
          deck={deck}
          card={edit}
          onClose={() => setEdit(null)}
          onRegenerate={() => {
            setRegen(edit);
            setEdit(null);
          }}
        />
      )}
      {regen && <RegenerateCardDialog deck={deck} card={deck.cards.find((x) => x.id === regen.id) ?? regen} onClose={() => setRegen(null)} />}
      {graphic && <GraphicDialog deck={deck} card={deck.cards.find((x) => x.id === graphic.id) ?? graphic} onClose={() => setGraphic(null)} />}
      {improve && <ImproveCardDialog deck={deck} card={deck.cards.find((x) => x.id === improve.id) ?? improve} onClose={() => setImprove(null)} />}
      {moving && sel && (
        <MoveCardsDialog
          deck={deck}
          cardIds={[...sel]}
          onClose={() => setMoving(false)}
          onMoved={(n, to) => {
            setSel(null);
            setNotice(n === 1 ? `1 Karte nach „${to.name}“ verschoben.` : `${n} Karten nach „${to.name}“ verschoben.`);
          }}
        />
      )}
      {del && <ConfirmModal title="Karte löschen?" text={cardFrontText(del)} onClose={() => setDel(null)} onConfirm={() => deleteCard(deck.id, del.id)} />}
      {ai && <CreateWithAI deckId={deck.id} onClose={() => setAi(false)} />}
      {anki && <AnkiImport onClose={() => setAnki(false)} targetDeckId={deck.id} />}
      {textImport && <TextImportModal deck={deck} onClose={() => setTextImport(false)} />}
      {showDups && <DuplicatesModal deck={deck} onClose={() => setShowDups(false)} />}
      {exporting && <ExportDialog deck={deck} onClose={() => setExporting(false)} />}
    </div>
  );
}
