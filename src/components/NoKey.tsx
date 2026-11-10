import { Link } from 'react-router-dom';
import { IconKey } from './Icons';

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
          funktionieren Karten-Erstellung, Zusammenfassungen, Quiz, Podcast und Tutor.
        </p>
        <Link to="/settings" className="btn primary sm">
          API-Key eintragen
        </Link>
      </div>
    </div>
  );
}
