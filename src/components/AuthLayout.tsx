import { useState, type ReactNode } from 'react';
import { HeroCarousel } from './HeroCarousel';
import { Logo } from './Logo';
import { Modal } from './Modal';
import { PrivacyModal } from './Consent';

export function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Nutzungshinweise" onClose={onClose}>
      <div className="prose-sm">
        <p>Diese App ist ein persönliches Lernwerkzeug. Du nutzt sie mit deinem eigenen KI-Zugang.</p>
        <p>
          Die Kosten für KI-Anfragen rechnet dein Anbieter direkt mit dir ab. Prüfe die Ergebnisse der KI – sie kann sich
          irren.
        </p>
        <p>Halte deinen API-Key geheim und nutze diese App nur auf Geräten, denen du vertraust.</p>
      </div>
    </Modal>
  );
}

export function AuthLayout({ children, variant }: { children: ReactNode; variant: 'setup' | 'forgot' }) {
  const [terms, setTerms] = useState(false);
  const [policy, setPolicy] = useState(false);
  return (
    <div className="auth-page">
      <main className={`auth-grid auth-${variant}`}>
        <div className="auth-left">
          <Logo className="auth-logo" />
          {children}
          <p className="auth-terms">
            Mit dem Start stimmst du den{' '}
            <button type="button" onClick={() => setTerms(true)}>
              Nutzungshinweisen
            </button>{' '}
            und der{' '}
            <button type="button" onClick={() => setPolicy(true)}>
              Datenschutzerklärung
            </button>{' '}
            dieser App zu.
          </p>
        </div>
        <HeroCarousel />
      </main>
      {terms && <TermsModal onClose={() => setTerms(false)} />}
      {policy && <PrivacyModal onClose={() => setPolicy(false)} />}
    </div>
  );
}
