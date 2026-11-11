import { Link } from 'react-router-dom';
import { APP_NAME } from '../lib/brand';

/** Own logo: two index cards with a small sprout growing out of the front one. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="3" y="14" width="24" height="18" rx="4" fill="#8fd4cb" />
      <rect x="8" y="12" width="25" height="19" rx="4.5" fill="#2a9d8f" />
      <rect x="13" y="18.5" width="12" height="2.2" rx="1.1" fill="#fff" />
      <rect x="13" y="23.5" width="9" height="2.2" rx="1.1" fill="#fff" />
      <rect x="25" y="6.5" width="1.6" height="6" rx="0.8" fill="#5fa83a" />
      <ellipse cx="28.8" cy="4.5" rx="3.6" ry="1.8" transform="rotate(-34 28.8 4.5)" fill="#8cc63f" />
      <ellipse cx="23.5" cy="5.9" rx="2.8" ry="1.4" transform="rotate(34 23.5 5.9)" fill="#6cb33f" />
    </svg>
  );
}

export function Logo({ to = '/dashboard', className = '' }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={`logo ${className}`} aria-label={`${APP_NAME} – zur Übersicht`}>
      <LogoMark size={34} />
      <span className="logo-word">{APP_NAME}</span>
    </Link>
  );
}
