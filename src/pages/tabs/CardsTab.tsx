import { useState } from 'react';
import { AnkiImport } from '../../components/AnkiImport';
import { CardContent, lookOf } from '../../components/CardContent';
import { CreateWithAI } from '../../components/CreateWithAI';
import { IconEdit, IconPlay, IconPlus, IconSearch, IconSparkle, IconTrash, IconUpload } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { ConfirmModal, Modal } from '../../components/Modal';
import { RichField } from '../../components/RichField';
import { cardBackText, cardFrontText, htmlToText, textToHtml } from '../../lib/content';
import { LEVELS, levelOf } from '../../lib/srs';
import { addCards, deleteCard, updateCard, type Card, type Deck } from '../../lib/store';
import { formatDue } from '../../lib/util';

function CardEditor({ deck, card, onClose, onAnki }: { deck: Deck; card?: Card; onClose: () => void; onAnki?: () => void }) {
  // The editor always works in HTML so pictures can be added; plain cards are converted.
  const toHtml = (s: string) => (card?.html ? s : textToHtml(s));
  const [front, setFront] = useState(card ? toHtml(card.front) : '');
  const [back, setBack] = useState(card ? toHtml(card.back) : '');
  const [empty, setEmpty] = useState({ front: !card, back: !card });
  const [round, setRound] = useState(0);
  const ok = !empty.front && !empty.back;
  const save = (again: boolean) => {
    if (!ok) return;
    if (card) updateCard(deck.id, card.id, { front, back, html: true });
    else addCards(deck.id, [{ front, back, html: true }]);
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
  const [limit, setLimit] = useState(100);
  const filtered = term ? deck.cards.filter((c) => (cardFrontText(c) + ' ' + cardBackText(c)).toLowerCase().includes(term)) : deck.cards;
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
                  <CardContent text={c.back} html={c.html} look={lookOf(deck, c)} className="ft-back" />
                </div>
                <div className="flash-meta">
                  <span className="level-badge" style={{ ['--c' as string]: lvl.color }}>
                    {lvl.label}
                  </span>
                  <small>{c.srs.last ? formatDue(c.srs.due) : 'neu'}</small>
                </div>
                <div className="flash-actions">
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
        />
      )}
      {del && (
        <ConfirmModal title="Karte löschen?" text={cardFrontText(del)} onClose={() => setDel(null)} onConfirm={() => deleteCard(deck.id, del.id)} />
      )}
      {ai && <CreateWithAI deckId={deck.id} onClose={() => setAi(false)} />}
      {anki && <AnkiImport onClose={() => setAnki(false)} targetDeckId={deck.id} />}
    </div>
  );
}
