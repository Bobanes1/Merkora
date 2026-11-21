import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setSettings, useStore } from '../lib/store';
import { Mascot, type Mood } from './Mascot';

type Step = { title: string; text: string; mood: Mood; color: number; to?: string; go?: string };

/** The steps of the short introduction (pure data, so it is easy to change). */
export const TOUR_STEPS: Step[] = [
  {
    title: 'Hallo, ich bin Pip! 🐬',
    text: 'Ich zeige dir in vier kurzen Schritten, wie Merkora funktioniert. Du kannst jederzeit überspringen – die Einführung findest du später wieder unter Einstellungen › Über die App.',
    mood: 'wave',
    color: 1,
  },
  {
    title: 'Decks anlegen',
    text: 'In der Bibliothek ordnest du alles in Kurse und Decks. Ein Deck füllst du selbst, mit der KI aus PDF, Word oder PowerPoint – oder du übernimmst einen Anki-Stapel.',
    mood: 'think',
    color: 2,
    to: '/library',
    go: 'Zur Bibliothek',
  },
  {
    title: 'Lernen – so wie es dir passt',
    text: 'In jedem Deck lernst du mit Karteikarten, im verspielten Lernpfad, mit Quiz, Zuordnen oder einer Probeprüfung. Merkora merkt sich, was du schon kannst, und fragt das Schwierige öfter.',
    mood: 'happy',
    color: 5,
  },
  {
    title: 'Skills: lernen durch Tun',
    text: 'Willst du ein Thema ohne Karteikarten lernen, z. B. Statistik, Jura oder Programmieren? Unter Skills planen wir zusammen einen Lernpfad bis zu deinem Ziel – mit Aufgaben zum Mitmachen.',
    mood: 'cheer',
    color: 3,
    to: '/skills',
    go: 'Skills ansehen',
  },
  {
    title: 'Planen und dranbleiben',
    text: 'Bei Prüfungen trägst du deine Termine ein. In den Merkora Tools findest du To-dos, den Fokus-Timer und die Arbeitsplanung. Viel Spaß – ich bin immer in der Nähe!',
    mood: 'happy',
    color: 4,
  },
];

/** Short introduction with Pip after the first start (can be opened again in the settings). */
export function Tour() {
  const show = useStore((s) => s.data.settings.setupDone && !s.data.settings.tourDone);
  const [i, setI] = useState(0);
  const navigate = useNavigate();
  if (!show) return null;
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;
  const done = () => (setSettings({ tourDone: true }), setI(0));
  return (
    <div className="tour-back" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-card" style={{ ['--tc' as string]: `var(--c${step.color})`, ['--tc-soft' as string]: `var(--c${step.color}-soft)` }}>
        <div className="tour-pip">
          <Mascot mood={step.mood} size={96} />
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.text}</p>
        <div className="tour-dots" aria-label={`Schritt ${i + 1} von ${TOUR_STEPS.length}`}>
          {TOUR_STEPS.map((s, k) => (
            <button key={s.title} type="button" className={k === i ? 'on' : ''} aria-label={`Schritt ${k + 1}`} onClick={() => setI(k)} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="btn ghost sm" onClick={done}>
            {last ? 'Schließen' : 'Überspringen'}
          </button>
          <span className="grow" />
          {step.to && (
            <button type="button" className="btn outline sm" onClick={() => (done(), navigate(step.to!))}>
              {step.go}
            </button>
          )}
          {i > 0 && (
            <button type="button" className="btn ghost sm" onClick={() => setI(i - 1)}>
              Zurück
            </button>
          )}
          <button type="button" className="btn primary" onClick={() => (last ? done() : setI(i + 1))} autoFocus>
            {last ? 'Los geht’s!' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}
