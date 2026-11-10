import { Link } from 'react-router-dom';
import { APP_NAME } from '../lib/brand';

/** Own logo: a tilted index card with a small sprout growing out of it. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="4" y="13" width="24" height="18" rx="4" fill="#d9c3ef" transform="rotate(-8 16 22)" />
      <rect x="8" y="14" width="24" height="18" rx="4" fill="#7e3bb5" />
      <path d="M13 20.5h10M13 25h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      <path d="M24 14V9" stroke="#2f9e5b" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 10c0-3.6 2.6-6 6.5-6 0 3.6-2.6 6-6.5 6z" fill="#3cba6f" />
      <path d="M24 11.5c0-2.8-2-4.6-5-4.6 0 2.8 2 4.6 5 4.6z" fill="#2f9e5b" />
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
