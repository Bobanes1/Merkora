import { useState } from 'react';
import { AnkiImport } from '../../components/AnkiImport';
import { OcclusionEditor } from '../../components/OcclusionEditor';
import { ExportDialog } from '../../components/ExportDialog';
import { allTags, hasTag, parseTags } from '../../lib/tags';
import { answerOnly } from '../../lib/backSide';
import { MarkButton } from '../../components/MarkButton';
import { CardContent, lookOf } from '../../components/CardContent';
import { CreateWithAI } from '../../components/CreateWithAI';
import { IconEdit, IconPlay, IconPlus, IconSearch, IconSparkle, IconTrash, IconDownload, IconTag, IconUpload, IconStar } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { ConfirmModal, Modal } from '../../components/Modal';
import { RichField } from '../../components/RichField';
import { cardBackText, cardFrontText, htmlToText, textToHtml } from '../../lib/content';
import { LEVELS, levelOf } from '../../lib/srs';
import { addCards, deleteCard, updateCard, type Card, type Deck } from '../../lib/store';
import { formatDue } from '../../lib/util';

function CardEditor({
  deck,
  card,
  onClose,
  onAnki,
  onOcclusion,
}: {
  deck: Deck;
  card?: Card;
  onClose: () => void;
  onAnki?: () => void;
  /** New card: switch to image occlusion (boxes over a picture → one card per box). */
  onOcclusion?: () => void;
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
  return (
    <Modal
      title={card ? 'Karte bearbeiten' : 'Neue Karte'}
      className={!card && onOcclusion ? 'new-card-modal' : ''}
      onClose={onClose}
      footer={
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
      }
    >
      {!card && onOcclusion && (
        <div className="seg card-kind" role="tablist" aria-label="Art der Karte">
          <button type="button" role="tab" aria-selected={true} className={'on'}>
            Text & Bilder
          </button>
          <button type="button" role="tab" aria-selected={false} className={''} onClick={onOcclusion} title="Kästen über ein Bild ziehen – jede Stelle wird eine Karte">
            Bildverdeckung
          </button>
        </div>
      )}
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
    </Modal>
  );
}

export default function CardsTab({ deck, onLearn }: { deck: Deck; onLearn: () => void }) {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Card | 'new' | null>(null);
  const [del, setDel] = useState<Card | null>(null);
  const [ai, setAi] = useState(false);
  const term = q.trim().toLowerCase();
  const [anki, setAnki] = useState(false);
  const [occl, setOccl] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [limit, setLimit] = useState(100);
  const [tag, setTag] = useState('');
  const [onlyMarked, setOnlyMarked] = useState(false);
  const markedCount = deck.cards.filter((c) => c.marked).length;
  const tags = allTags(deck.cards);
  const filtered = deck.cards.filter(
    (c) =>
      (!tag || hasTag(c, tag)) &&
      (!onlyMarked || c.marked) &&
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
      {(tags.length > 0 || markedCount > 0) && (
        <div className="tag-filter" aria-label="Nach Tag filtern">
          <IconTag size={14} />
          <button type="button" className={`tag ${!tag && !onlyMarked ? 'on' : ''}`} onClick={() => (setTag(''), setOnlyMarked(false))}>
            Alle
          </button>
          {markedCount > 0 && (
            <button type="button" className={`tag mark-filter ${onlyMarked ? 'on' : ''}`} aria-pressed={onlyMarked} onClick={() => setOnlyMarked(!onlyMarked)}>
              <IconStar size={12} /> Markiert ({markedCount})
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
                  {c.srs.last && <small>{formatDue(c.srs.due)}</small>}
                </div>
                <div className="flash-actions">
                  <MarkButton deckId={deck.id} card={c} />
                  <button type="button" className="icon-btn" aria-label="Bearbeiten" onClick={() => setEdit(c)}>
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
      {edit && (
        <CardEditor
          deck={deck}
          card={edit === 'new' ? undefined : edit}
          onClose={() => setEdit(null)}
          onAnki={() => {
            setEdit(null);
            setAnki(true);
          }}
          onOcclusion={() => {
            setEdit(null);
            setOccl(true);
          }}
        />
      )}
      {del && (
        <ConfirmModal title="Karte löschen?" text={cardFrontText(del)} onClose={() => setDel(null)} onConfirm={() => deleteCard(deck.id, del.id)} />
      )}
      {ai && <CreateWithAI deckId={deck.id} onClose={() => setAi(false)} />}
      {anki && <AnkiImport onClose={() => setAnki(false)} targetDeckId={deck.id} />}
      {occl && (
        <OcclusionEditor
          deck={deck}
          onClose={() => setOccl(false)}
          onText={() => {
            setOccl(false);
            setEdit('new');
          }}
        />
      )}
      {exporting && <ExportDialog deck={deck} onClose={() => setExporting(false)} />}
    </div>
  );
}
