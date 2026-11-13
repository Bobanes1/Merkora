import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ImproveCardDialog } from '../../components/ImproveCardDialog';
import { canReverse, isLeech } from '../../lib/cardLinks';
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
import { IconEdit, IconPlay, IconPlus, IconSearch, IconSparkle, IconTrash, IconDownload, IconImage, IconTag, IconUpload, IconStar } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { ConfirmModal, Modal } from '../../components/Modal';
import { RichField } from '../../components/RichField';
import { cardBackText, cardFrontText, htmlToText, textToHtml } from '../../lib/content';
import { LEVELS, levelOf } from '../../lib/srs';
import { addCards, addReversed, deleteCard, removeReversed, updateCard, type Card, type Deck } from '../../lib/store';
import { formatDue } from '../../lib/util';

function CardEditor({
  deck,
  card,
  onClose,
  onAnki,
  embed,
}: {
  deck: Deck;
  card?: Card;
  onClose: () => void;
  onAnki?: () => void;
  /** Inside the shared "Neue Karte" window (see NewCardWindow). */
  embed?: Embed;
}) {
  // The editor always works in HTML so pictures can be added; plain cards are converted.
  const toHtml = (s: string) => (card?.html ? s : textToHtml(s));
  const [front, setFront] = useState(card ? toHtml(card.front) : '');
  const [back, setBack] = useState(card ? toHtml(card.back) : '');
  const [empty, setEmpty] = useState({ front: !card, back: !card });
  const [round, setRound] = useState(0);
  const [tagText, setTagText] = useState((card?.tags ?? []).join(' '));
  const ok = !empty.front && !empty.back;
  const save = (again: boolean) => {
    if (!ok) return;
    const tags = parseTags(tagText);
    if (card) updateCard(deck.id, card.id, { front, back, html: true, tags: tags.length ? tags : undefined });
    else addCards(deck.id, [{ front, back, html: true, tags }]);
    if (again) {
      setFront('');
      setBack('');
      setEmpty({ front: true, back: true });
      setRound((r) => r + 1);
    } else onClose();
  };
  const footer = (
    <>
      {!card && (
        <button type="button" className="btn ghost" onClick={() => save(true)} disabled={!ok}>
          Speichern & nächste
        </button>
      )}
      <button type="button" className="btn primary" onClick={() => save(false)} disabled={!ok}>
        Speichern
      </button>
    </>
  );
  const body = (
    <>
      {!card && onAnki && (
        <div className="editor-alt">
          <IconUpload size={15} />
          <span>Schon Karten in Anki?</span>
          <button type="button" className="link-btn" onClick={onAnki}>
            Anki-Stapel (.apkg) in dieses Deck importieren
          </button>
        </div>
      )}
      <div key={round}>
        <RichField
          id="card-front"
          label="Vorderseite (Frage)"
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
 * "Neue Karte": one window that stays open while switching between a text card and image occlusion –
 * only the content changes (no closing and reopening, so nothing flickers).
 */
function NewCardWindow({ deck, onClose, onAnki }: { deck: Deck; onClose: () => void; onAnki: () => void }) {
  const [kind, setKind] = useState<'text' | 'occl'>('text');
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
          Text & Bilder
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
        <CardEditor deck={deck} onClose={onClose} onAnki={onAnki} embed={{ footerEl }} />
      ) : (
        <OcclusionEditor deck={deck} onClose={onClose} embed={{ footerEl }} />
      )}
    </Modal>
  );
}

export default function CardsTab({ deck, onLearn }: { deck: Deck; onLearn: () => void }) {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [edit, setEdit] = useState<Card | 'new' | null>(null);
  const [del, setDel] = useState<Card | null>(null);
  const [graphic, setGraphic] = useState<Card | null>(null);
  const [ai, setAi] = useState(false);
  const term = q.trim().toLowerCase();
  const [anki, setAnki] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [limit, setLimit] = useState(100);
  const [tag, setTag] = useState('');
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [onlyLeech, setOnlyLeech] = useState(params.get('filter') === 'leech');
  const [improve, setImprove] = useState<Card | null>(null);
  const [reverseAll, setReverseAll] = useState(false);
  const markedCount = deck.cards.filter((c) => c.marked).length;
  const leechCount = deck.cards.filter(isLeech).length;
  const twinOf = new Set(deck.cards.filter((c) => c.reverseOf).map((c) => c.reverseOf));
  const reversible = deck.cards.filter((c) => canReverse(c) && !twinOf.has(c.id));
  const tags = allTags(deck.cards);
  const filtered = deck.cards.filter(
    (c) =>
      (!tag || hasTag(c, tag)) &&
      (!onlyMarked || c.marked) &&
      (!onlyLeech || isLeech(c)) &&
      (!term || (cardFrontText(c) + ' ' + cardBackText(c) + ' ' + (c.tags ?? []).join(' ')).toLowerCase().includes(term)),
  );
  const cards = filtered.slice(0, limit);
  const job = useJob(deck.id, 'cards');

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
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setReverseAll(true)}
          disabled={!reversible.length && !twinOf.size}
          title="Karten zusätzlich von der Antwort her abfragen (z. B. Begriff ↔ Definition)"
        >
          ↔ Umgekehrt
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setExporting(true)} disabled={!deck.cards.length}>
          <IconDownload size={15} /> Exportieren
        </button>
        <button type="button" className="btn primary sm" onClick={onLearn} disabled={!deck.cards.length}>
          <IconPlay size={12} /> Lernen
        </button>
      </div>
      {isActive(job) && job && <JobBanner job={job} />}
      <JobError job={job} />
      <div className="search">
        <IconSearch size={16} />
        <input placeholder="Suche" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Karten durchsuchen" />
      </div>
      {(tags.length > 0 || markedCount > 0 || leechCount > 0) && (
        <div className="tag-filter" aria-label="Nach Tag filtern">
          <IconTag size={14} />
          <button type="button" className={`tag ${!tag && !onlyMarked && !onlyLeech ? 'on' : ''}`} onClick={() => (setTag(''), setOnlyMarked(false), setOnlyLeech(false))}>
            Alle
          </button>
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
          {tags.slice(0, 30).map((t) => (
            <button key={t} type="button" className={`tag ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? '' : t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      {deck.cards.length === 0 ? (
        <div className="empty">
          <b>Dieses Deck ist noch leer</b>
          <p className="muted">Lass die KI Karten aus deinem Lernmaterial erstellen, schreibe selbst welche oder übernimm einen Anki-Stapel.</p>
          <div className="row-gap center">
            <button type="button" className="btn primary" onClick={() => setAi(true)}>
              <IconSparkle size={16} /> Mit KI erstellen
            </button>
            <button type="button" className="btn outline" onClick={() => setEdit('new')}>
              <IconPlus size={16} /> Karte schreiben
            </button>
            <button type="button" className="btn outline" onClick={() => setAnki(true)}>
              <IconUpload size={16} /> Anki-Stapel importieren
            </button>
          </div>
        </div>
      ) : (
        <div className="card-list">
          {cards.map((c) => {
            const lvl = LEVELS.find((l) => l.id === levelOf(c.srs))!;
            return (
              <article key={c.id} className="flash-row">
                <div className="flash-text">
                  <CardContent text={c.front} html={c.html} look={lookOf(deck, c)} className="ft-front" />
                  <CardContent text={c.html ? answerOnly(c.front, c.back) : c.back} html={c.html} look={lookOf(deck, c)} className="ft-back" />
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
                  <span className="level-badge" style={{ ['--c' as string]: lvl.color }}>
                    {lvl.label}
                  </span>
                  {isLeech(c) && (
                    <button type="button" className="leech-badge" title={`${c.srs.lapses}× vergessen – Karte verbessern`} onClick={() => setImprove(c)}>
                      Problemkarte
                    </button>
                  )}
                  {c.reverseOf && (
                    <span className="twin-badge" title="Umgekehrte Karte – folgt automatisch ihrem Original">
                      ↔ umgekehrt
                    </span>
                  )}
                  {c.srs.last && <small>{formatDue(c.srs.due)}</small>}
                </div>
                <div className="flash-actions">
                  <MarkButton deckId={deck.id} card={c} />
                  {canReverse(c) && (
                    <button
                      type="button"
                      className={'icon-btn twin-btn' + (twinOf.has(c.id) ? ' on' : '')}
                      aria-label={twinOf.has(c.id) ? 'Nicht mehr umgekehrt abfragen' : 'Auch umgekehrt abfragen'}
                      aria-pressed={twinOf.has(c.id)}
                      title={twinOf.has(c.id) ? 'Wird auch umgekehrt abgefragt – klicken zum Entfernen' : 'Auch umgekehrt abfragen (Antwort → Frage)'}
                      onClick={() => (twinOf.has(c.id) ? removeReversed(deck.id, [c.id]) : addReversed(deck.id, [c.id]))}
                    >
                      ↔
                    </button>
                  )}
                  <button type="button" className="icon-btn" aria-label="Grafik" title="Grafik erstellen, ersetzen oder entfernen" onClick={() => setGraphic(c)}>
                    <IconImage size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Bearbeiten"
                    title={c.reverseOf ? 'Bearbeitet das Original – die umgekehrte Karte passt sich an' : undefined}
                    onClick={() => setEdit(c.reverseOf ? (deck.cards.find((x) => x.id === c.reverseOf) ?? c) : c)}
                  >
                    <IconEdit size={16} />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Löschen" onClick={() => setDel(c)}>
                    <IconTrash size={16} />
                  </button>
                </div>
              </article>
            );
          })}
          {cards.length === 0 && <p className="muted">Keine Karte passt zu „{q}“.</p>}
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
        />
      )}
      {edit && edit !== 'new' && <CardEditor deck={deck} card={edit} onClose={() => setEdit(null)} />}
      {graphic && (
        <GraphicDialog deck={deck} card={deck.cards.find((x) => x.id === graphic.id) ?? graphic} onClose={() => setGraphic(null)} />
      )}
      {improve && <ImproveCardDialog deck={deck} card={deck.cards.find((x) => x.id === improve.id) ?? improve} onClose={() => setImprove(null)} />}
      {reverseAll && (
        <Modal
          title="Umgekehrt abfragen"
          onClose={() => setReverseAll(false)}
          footer={
            <>
              {twinOf.size > 0 && (
                <button type="button" className="btn ghost danger-text" onClick={() => (removeReversed(deck.id, [...twinOf] as string[]), setReverseAll(false))}>
                  Alle {twinOf.size} umgekehrten Karten entfernen
                </button>
              )}
              <span className="grow" />
              <button type="button" className="btn ghost" onClick={() => setReverseAll(false)}>
                Abbrechen
              </button>
              <button type="button" className="btn primary" disabled={!reversible.length} onClick={() => (addReversed(deck.id, reversible.map((c) => c.id)), setReverseAll(false))}>
                {reversible.length} Karten auch umgekehrt abfragen
              </button>
            </>
          }
        >
          <p>
            Jede Karte bekommt eine Zwillingskarte, die von der Antwort her fragt – z. B. Definition → Begriff. Sie hat ihren eigenen Lernstand,
            startet als neue Karte und passt sich an, wenn du das Original bearbeitest.
          </p>
          <p className="muted small">Bildverdeckungen und Anki-Karten mit eigenem Layout werden nicht umgedreht. Einzelne Karten schaltest du mit ↔ in der Kartenliste um.</p>
        </Modal>
      )}
      {del && (
        <ConfirmModal title="Karte löschen?" text={cardFrontText(del)} onClose={() => setDel(null)} onConfirm={() => deleteCard(deck.id, del.id)} />
      )}
      {ai && <CreateWithAI deckId={deck.id} onClose={() => setAi(false)} />}
      {anki && <AnkiImport onClose={() => setAnki(false)} targetDeckId={deck.id} />}
      {exporting && <ExportDialog deck={deck} onClose={() => setExporting(false)} />}
    </div>
  );
}
