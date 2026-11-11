import { Link } from 'react-router-dom';
import { IconClose, IconKey } from './Icons';
import { setSettings } from '../lib/store';

export function NoKeyNotice({ compact }: { compact?: boolean }) {
  return (
    <div className={`nokey ${compact ? 'compact' : ''}`}>
      <span className="nokey-icon">
        <IconKey size={20} />
      </span>
      <div>
        <b>Für KI-Funktionen brauchst du einen API-Key</b>
        <p>
          Hinterlege einmal deinen eigenen Schlüssel von OpenAI, Anthropic (Claude), Google Gemini oder OpenRouter – dann
          funktionieren Karten-Erstellung, Zusammenfassungen, Quiz und Tutor.
        </p>
        <Link to="/settings" className="btn primary sm">
          API-Key eintragen
        </Link>
      </div>
    </div>
  );
}

/** Slim, closable hint on the start page – learning flashcards works without any AI. */
export function NoKeyHint() {
  return (
    <div className="nokey-hint" role="note">
      <IconKey size={16} />
      <span className="grow">
        <b>KI ist aus.</b> Karten lernen geht auch ohne – für KI-Funktionen brauchst du einen eigenen API-Key.
      </span>
      <Link to="/settings" className="small-link">
        Key eintragen
      </Link>
      <button type="button" className="icon-btn" aria-label="Hinweis schließen" title="Hinweis schließen" onClick={() => setSettings({ noKeyHintClosed: true })}>
        <IconClose size={14} />
      </button>
    </div>
  );
}
