import { useState } from 'react';
import { buildShare, SHARE_EXT } from '../lib/share';
import { addCards, addDeck, setSettings, updateDeck, useStore, type Deck } from '../lib/store';
import type { SharePack } from '../lib/share';
import { download } from '../lib/util';
import { Modal } from './Modal';

/** Save a deck (and its mock exam) as a .merkora file to send to friends. */
export function ShareDialog({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const saved = useStore((s) => s.data.settings.shareName ?? '');
  const [name, setName] = useState(saved);
  const ex = deck.mockExam;
  const hasExam = !!ex && ex.questions.length > 0 && ex.status !== 'generating';
  const [withExam, setWithExam] = useState(hasExam);
  const [withResult, setWithResult] = useState(!!ex?.result);
  const hasMedia = deck.cards.some((c) => c.html && /<img|\[sound:/i.test(c.front + c.back));

  const save = () => {
    setSettings({ shareName: name.trim() });
    const pack = buildShare(deck, name, { exam: withExam, result: withResult });
    download(`${deck.name.replace(/[\\/:*?"<>|]+/g, '-')}${SHARE_EXT}`, JSON.stringify(pack), 'application/json');
    onClose();
  };

  return (
    <Modal title="Mit Freunden teilen" onClose={onClose}>
      <p className="muted">
        Merkora speichert „{deck.name}“ als Datei. Schick sie per Chat oder Mail – deine Freunde öffnen sie über <b>Neues Deck › Von Freunden</b>.
        Dein Lernfortschritt wird nicht mitgeschickt.
      </p>
      <label className="field-label" htmlFor="share-name">
        Dein Name (sehen deine Freunde)
      </label>
      <input id="share-name" className="input" value={name} maxLength={40} placeholder="z. B. Jan" onChange={(e) => setName(e.target.value)} />
      {hasExam && (
        <>
          <label className="check-row">
            <input type="checkbox" checked={withExam} onChange={(e) => setWithExam(e.target.checked)} />
            <span>
              <b>Probeprüfung mitschicken</b> – „{ex!.title}“, damit ihr dieselbe Prüfung schreibt
            </span>
          </label>
          {withExam && ex!.result && (
            <label className="check-row">
              <input type="checkbox" checked={withResult} onChange={(e) => setWithResult(e.target.checked)} />
              <span>
                <b>Meine Note zum Vergleichen</b> ({ex!.result.grade}, {ex!.result.percent} %) – wird erst nach der Abgabe angezeigt
              </span>
            </label>
          )}
        </>
      )}
      {hasMedia && <p className="muted small">Bilder und Töne aus Anki werden nicht mitgeschickt – dafür eignet sich der Anki-Export.</p>}
      <div className="row-gap end">
        <button type="button" className="btn ghost" onClick={onClose}>
          Abbrechen
        </button>
        <button type="button" className="btn primary" onClick={save} disabled={!deck.cards.length && !withExam}>
          Datei speichern
        </button>
      </div>
    </Modal>
  );
}

/** Creates the deck (and the friend's exam) from a shared file. */
export function importShare(pack: SharePack, courseId: string, deckName?: string): Deck {
  const deck = addDeck(courseId, deckName?.trim() || pack.deck.name, { source: pack.deck.source, ...(pack.deck.styles ? { styles: pack.deck.styles } : {}) });
  addCards(deck.id, pack.deck.cards);
  if (pack.exam)
    updateDeck(deck.id, {
      mockExam: {
        ...pack.exam,
        id: Math.random().toString(36).slice(2),
        createdAt: Date.now(),
        status: 'ready',
        scope: 'deck',
        answers: {},
        friend: { name: pack.from, ...(pack.result ?? {}) },
      },
    });
  return deck;
}
