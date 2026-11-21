import { useState } from 'react';
import { COVER_ICONS, COVER_PATTERNS, coverOf, type CoverIcon, type CoverPattern, type DeckCover } from '../lib/look';
import { updateDeck, type Deck } from '../lib/store';
import { Modal } from './Modal';

/** Thin line icons for deck covers (24×24, stroke only). */
const ICON_PATHS: Record<CoverIcon, string> = {
  cards: 'M4 7h12v13H4zM8 4h12v13',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z',
  code: 'm8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  calc: 'M6 3h12v18H6zM9 7h6M9 12h1M14 12h1M9 16h1M14 16h1',
  scale: 'M12 4v16M7 20h10M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z',
  leaf: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  chart: 'M4 20h16M7 16v-4M12 16V8M17 16v-7',
  palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1 3-2 3-5A9 9 0 0 0 12 3zM7.5 11h.01M10 7.5h.01M15 7.5h.01',
  language: 'M4 5h9M8.5 3v2M6 5c1 4 4 7 7 8M11 5c-1 4-4 7-7 8M13 21l4-9 4 9M14.5 18h5',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11v2',
};
export const COVER_ICON_LABEL: Record<CoverIcon, string> = {
  cards: 'Karten', book: 'Buch', brain: 'Kopf', flask: 'Labor', globe: 'Welt', music: 'Musik', code: 'Code', calc: 'Rechnen',
  scale: 'Recht', leaf: 'Natur', heart: 'Medizin', star: 'Stern', chart: 'Daten', palette: 'Kunst', language: 'Sprache', target: 'Ziel',
};
const PATTERN_LABEL: Record<CoverPattern, string> = { dots: 'Punkte', waves: 'Wellen', grid: 'Raster', stripes: 'Streifen', plain: 'Schlicht' };

export function CoverIconSvg({ icon, size = 18 }: { icon: CoverIcon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[icon]} />
    </svg>
  );
}

/** The small square cover of a deck: colour gradient, pattern, icon. */
export function DeckCoverTile({ cover, size = 40, onClick, title }: { cover: DeckCover; size?: number; onClick?: () => void; title?: string }) {
  const style = { width: size, height: size, ['--cv' as string]: `var(--c${cover.color})` };
  const inner = <CoverIconSvg icon={cover.icon} size={Math.round(size * 0.5)} />;
  return onClick ? (
    <button type="button" className={`deck-cover p-${cover.pattern}`} style={style} onClick={onClick} title={title ?? 'Cover ändern'} aria-label={title ?? 'Cover ändern'}>
      {inner}
    </button>
  ) : (
    <span className={`deck-cover p-${cover.pattern}`} style={style} aria-hidden="true">
      {inner}
    </span>
  );
}
export const DeckCoverOf = ({ deck, size }: { deck: Pick<Deck, 'id' | 'cover'>; size?: number }) => <DeckCoverTile cover={coverOf(deck)} size={size} />;

/** „Cover ändern“: colour, pattern, icon – with a live preview. */
export function CoverDialog({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [c, setC] = useState<DeckCover>(coverOf(deck));
  const save = () => (updateDeck(deck.id, { cover: c }), onClose());
  return (
    <Modal title="Cover ändern" onClose={onClose}>
      <div className="cover-dialog">
        <div className="cover-preview">
          <DeckCoverTile cover={c} size={88} />
          <b>{deck.name}</b>
        </div>
        <span className="field-label">Farbe</span>
        <div className="cover-colors" role="radiogroup" aria-label="Farbe">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={c.color === n} aria-label={`Farbe ${n}`} className={c.color === n ? 'on' : ''} style={{ ['--cv' as string]: `var(--c${n})` }} onClick={() => setC((x) => ({ ...x, color: n }))} />
          ))}
        </div>
        <span className="field-label">Muster</span>
        <div className="chips">
          {COVER_PATTERNS.map((p) => (
            <button key={p} type="button" className={`chip ${c.pattern === p ? 'on' : ''}`} onClick={() => setC((x) => ({ ...x, pattern: p }))}>
              {PATTERN_LABEL[p]}
            </button>
          ))}
        </div>
        <span className="field-label">Symbol</span>
        <div className="cover-icons" role="radiogroup" aria-label="Symbol">
          {COVER_ICONS.map((ic) => (
            <button key={ic} type="button" role="radio" aria-checked={c.icon === ic} title={COVER_ICON_LABEL[ic]} aria-label={COVER_ICON_LABEL[ic]} className={c.icon === ic ? 'on' : ''} onClick={() => setC((x) => ({ ...x, icon: ic }))}>
              <CoverIconSvg icon={ic} size={20} />
            </button>
          ))}
        </div>
        <div className="row-gap end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={save}>
            Übernehmen
          </button>
        </div>
      </div>
    </Modal>
  );
}
