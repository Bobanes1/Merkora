import { useEffect, useState } from 'react';
import { LogoMark } from './Logo';

const SLIDES = [
  'Mach aus deinen Notizen Karteikarten, Zusammenfassungen, Quizze, Podcasts und noch mehr.',
  'Lerne jede Karte genau dann, wenn du sie sonst vergessen würdest – auf jedem Gerät.',
  'Frag deinen KI-Tutor alles zu deinem Stoff – mit deinem eigenen API-Schlüssel.',
];

const ICON_PATHS: Record<string, string> = {
  check: '<path d="m5 12 5 5 9-10" stroke-width="3"/>',
  headphones:
    '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h11a3 3 0 0 1 3 3v11"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  sparkle: '<path d="M12 3 13.8 9.2 20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8zM19 3v4M21 5h-4"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6.5-4-10-2.5 2-3 4-3 6-1-1-2-2-2-4-2.5 2-5 5-5 8a7 7 0 0 0 7 7z"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
};

const svgUrl = (svg: string) => 'data:image/svg+xml,' + encodeURIComponent(svg);
const OWL = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M19 9 C21 4 26 2 29 2.5 C27 5 26 8 26 11z" fill="#2489bf"/><circle cx="20" cy="22" r="15" fill="#45b4e3"/><ellipse cx="20" cy="28" rx="8.5" ry="7" fill="#e3f6fd"/><ellipse cx="20" cy="26" rx="5" ry="3" fill="#9fdcf4"/><path d="M17 26.2q3 2.6 6 0" stroke="#0b2540" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="14" cy="19" r="4.6" fill="#fff"/><circle cx="26" cy="19" r="4.6" fill="#fff"/><circle cx="14.4" cy="19.4" r="2.5" fill="#0b2540"/><circle cx="25.6" cy="19.4" r="2.5" fill="#0b2540"/><circle cx="15.3" cy="18.4" r=".9" fill="#fff"/><circle cx="26.5" cy="18.4" r=".9" fill="#fff"/><circle cx="10" cy="24.5" r="1.8" fill="#f6a5c0" opacity=".7"/><circle cx="30" cy="24.5" r="1.8" fill="#f6a5c0" opacity=".7"/></svg>',
);
const RING = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="#d8f0ef" stroke-width="4"/><circle cx="18" cy="18" r="15" fill="none" stroke="#09817e" stroke-width="4" stroke-dasharray="68 94" stroke-linecap="round" transform="rotate(-90 18 18)"/></svg>',
);
const iconUrl = (name: string) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`,
  );

function Tile({ color, icon, alt, className }: { color: string; icon: string; alt: string; className: string }) {
  return (
    <div className={`hero-tile ${className}`}>
      <div className="hero-tile-inner" style={{ background: color }}>
        <img src={iconUrl(icon)} alt={alt} width={30} height={30} />
      </div>
    </div>
  );
}

function Bars({ n, w = [100, 80] }: { n: number; w?: number[] }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="mk-bar" style={{ width: `${w[i % w.length]}%` }} />
      ))}
    </>
  );
}

function WindowMock() {
  return (
    <div className="mk-window">
      <div className="mk-side">
        <LogoMark size={10} />
        <span className="mk-dot purple" />
        <span className="mk-dot" />
        <span className="mk-dot" />
      </div>
      <div className="mk-body">
        <div className="mk-top">
          <span>Biologie</span>
          <span className="mk-sep">›</span>
          <span>Zellbiologie</span>
          <span className="mk-sep">›</span>
          <b>Die Zelle</b>
          <span className="mk-grow" />
          <span>Teilen</span>
        </div>
        <div className="mk-panes">
          <div className="mk-pane">
            <div className="mk-tabs">
              <span className="on">Karteikarten</span>
              <span>Quiz</span>
              <span>Podcast</span>
            </div>
            <div className="mk-row">
              <b>86 Karteikarten</b>
              <span className="mk-grow" />
              <span className="mk-btn">Lernen</span>
            </div>
            <div className="mk-search">Suche</div>
            {['Was ist ein Mitochondrium?', 'Aufgabe der Zellmembran', 'Was passiert bei der Mitose?', 'Unterschied Pro- und Eukaryot'].map(
              (t, i) => (
                <div className="mk-card" key={t}>
                  <b>{t}</b>
                  <Bars n={i % 2 ? 2 : 3} w={[96, 88, 60]} />
                </div>
              ),
            )}
          </div>
          <div className="mk-pane mk-chat">
            <div className="mk-row">
              <span>Neues Gespräch</span>
              <span className="mk-grow" />
              <span>Neuer Chat</span>
            </div>
            <div className="mk-owl">
              <img src={OWL} alt="Tutor" width={38} height={38} />
            </div>
            <p className="mk-hello">Hallo! Wobei kann ich dir heute helfen?</p>
            <span className="mk-chip">Fasse dieses Deck für mich zusammen.</span>
            <span className="mk-chip">Stell mir eine Prüfungsfrage.</span>
            <span className="mk-chip">Wie lerne ich das am besten?</span>
            <div className="mk-input">Was möchtest du wissen?</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneMock() {
  return (
    <div className="mk-phone-wrap">
      <div className="mk-phone">
        <div className="mk-phone-top">
          <span>12 / 30</span>
          <span className="mk-progress">
            <i style={{ width: '40%' }} />
          </span>
        </div>
        <div className="mk-flash">
          <small>Frage</small>
          <b>Was beschreibt die Vergessenskurve?</b>
          <hr />
          <small>Antwort</small>
          <span>Wie schnell Gelerntes ohne Wiederholung verloren geht.</span>
        </div>
        <div className="mk-rate">
          <span className="again">Nochmal</span>
          <span className="hard">Schwer</span>
          <span className="good">Gut</span>
          <span className="easy">Einfach</span>
        </div>
      </div>
      <div className="mk-phone mk-phone-2">
        <div className="mk-ring">
          <img src={RING} alt="Lernfortschritt" width={84} height={84} />
          <b>72%</b>
        </div>
        <small className="mk-center">Beherrschung</small>
        {['#09817e', '#32bdb9', '#f2b84b', '#d9d9d9'].map((c, i) => (
          <div className="mk-level" key={c}>
            <i style={{ background: c }} />
            <span className="mk-bar" style={{ width: `${[70, 46, 30, 18][i]}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DocMock() {
  return (
    <div className="mk-doc">
      <h4>Zusammenfassung: Die Zelle</h4>
      <span className="mk-h">Aufbau</span>
      <Bars n={3} w={[98, 92, 70]} />
      <span className="mk-h">Organellen</span>
      <ul>
        <li>
          <b>Zellkern</b> – enthält die Erbinformation
        </li>
        <li>
          <b>Mitochondrien</b> – liefern Energie (ATP)
        </li>
        <li>
          <b>Ribosomen</b> – bauen Proteine
        </li>
      </ul>
      <span className="mk-h">Das Wichtigste in Kürze</span>
      <Bars n={2} w={[90, 64]} />
    </div>
  );
}

export function HeroCarousel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 7000);
    return () => clearInterval(t);
  }, [i]);
  return (
    <aside className="hero" aria-label="Was diese App kann">
      <div className="hero-region" role="region" aria-roledescription="carousel">
        <div className="hero-track" style={{ transform: `translateX(-${i * 100}%)` }}>
          <div className="hero-slide" role="group" aria-hidden={i !== 0}>
            <div className="hero-stage">
              <WindowMock />
              <Tile className="t-duel" color="linear-gradient(160deg,#13ccc8,#199d99)" icon="check" alt="Quiz" />
              <Tile className="t-pod" color="linear-gradient(160deg,#4aa8ff,#1f7be8)" icon="headphones" alt="Podcast" />
              <Tile className="t-card" color="linear-gradient(160deg,#ffd54f,#f5b300)" icon="cards" alt="Karteikarten" />
            </div>
          </div>
          <div className="hero-slide" role="group" aria-hidden={i !== 1}>
            <div className="hero-stage">
              <PhoneMock />
              <Tile className="t-pod" color="linear-gradient(160deg,#ffb36b,#f07d1a)" icon="flame" alt="Lernserie" />
              <Tile className="t-card" color="linear-gradient(160deg,#1ba19d,#09817e)" icon="star" alt="Lernpfad" />
            </div>
          </div>
          <div className="hero-slide" role="group" aria-hidden={i !== 2}>
            <div className="hero-stage">
              <DocMock />
              <Tile className="t-tutor" color="linear-gradient(160deg,#1ba19d,#09817e)" icon="chat" alt="Tutor" />
              <Tile className="t-edit" color="linear-gradient(160deg,#ff8a80,#ef5350)" icon="note" alt="Notizen" />
              <Tile className="t-spark" color="linear-gradient(160deg,#ffd54f,#f5b300)" icon="sparkle" alt="KI" />
            </div>
          </div>
        </div>
      </div>
      <h2 className="hero-title">{SLIDES[i]}</h2>
      <div className="hero-dots">
        {SLIDES.map((_, k) => (
          <button
            key={k}
            type="button"
            className={k === i ? 'on' : ''}
            aria-label={`Folie ${k + 1}`}
            onClick={() => setI(k)}
          />
        ))}
      </div>
    </aside>
  );
}

