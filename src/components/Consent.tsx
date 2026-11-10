import { useState } from 'react';
import { setPrivacy, useStore } from '../lib/store';
import { Modal } from './Modal';

export function PrivacyText() {
  return (
    <div className="prose-sm">
      <p>
        Diese App hat <b>kein Konto und keinen eigenen Server</b>. Deine Decks, Karteikarten und dein Lernfortschritt
        liegen nur in deinem Browser.
      </p>
      <p>
        Wenn du eine KI-Funktion nutzt, wird der dafür nötige Text zusammen mit deinem API-Key <b>direkt</b> an den von dir
        gewählten KI-Anbieter (z. B. OpenAI, Anthropic, Google) geschickt. Für diese Anfragen gelten dessen
        Datenschutzbestimmungen und Kosten.
      </p>
      <p>
        Es gibt kein Tracking und keine Werbung. Dein Lernstand wird automatisch auf diesem Gerät gespeichert – kurz nach
        jeder Änderung. Ob dein API-Key gemerkt wird, entscheidest du selbst.
      </p>
    </div>
  );
}

export function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Datenschutzerklärung" onClose={onClose}>
      <PrivacyText />
    </Modal>
  );
}

export function ManagePrivacy({ onClose }: { onClose: () => void }) {
  const privacy = useStore((s) => s.privacy);
  const [keepKey, setKeepKey] = useState(privacy.keepKey);
  return (
    <Modal
      title="Auswahl verwalten"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            setPrivacy({ consent: 'custom', keepData: true, keepKey });
            onClose();
          }}
        >
          Auswahl speichern
        </button>
      }
    >
      <label className="toggle-row">
        <input type="checkbox" checked disabled />
        <span>
          <b>Notwendig</b>
          <small>Merkt sich deine Entscheidung zu diesen Einstellungen.</small>
        </span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked disabled />
        <span>
          <b>Lernstand automatisch speichern</b>
          <small>Immer an: Decks, Karten und Fortschritt bleiben auch nach dem Schließen erhalten.</small>
        </span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={keepKey} onChange={(e) => setKeepKey(e.target.checked)} />
        <span>
          <b>API-Key merken</b>
          <small>Du musst deinen Key nicht bei jedem Besuch neu eingeben.</small>
        </span>
      </label>
    </Modal>
  );
}

export function ConsentBanner() {
  const consent = useStore((s) => s.privacy.consent);
  const [manage, setManage] = useState(false);
  const [policy, setPolicy] = useState(false);
  if (consent !== 'unset') return null;
  return (
    <>
      <section className="consent" role="region" aria-labelledby="consent-title">
        <div className="consent-box">
          <h2 id="consent-title">Deine Datenschutz-Einstellungen</h2>
          <p>
            Wir nutzen keine Cookies und messen nie deine Nutzung. Damit Merkora läuft, speichert die App deinen
            Lernstand automatisch auf deinem Gerät, ohne etwas an einen Server zu schicken. Du entscheidest nur, ob dein Key bleibt.
          </p>
          <div className="consent-actions">
            <button type="button" className="c-reject" onClick={() => setPrivacy({ consent: 'none', keepData: true, keepKey: false })}>
              Alle ablehnen
            </button>
            <button type="button" className="c-accept" onClick={() => setPrivacy({ consent: 'all', keepData: true, keepKey: true })}>
              Alle annehmen
            </button>
          </div>
          <button type="button" className="c-manage" onClick={() => setManage(true)}>
            Auswahl verwalten
          </button>
          <button type="button" className="c-link" onClick={() => setPolicy(true)}>
            Datenschutzerklärung
          </button>
        </div>
      </section>
      {manage && <ManagePrivacy onClose={() => setManage(false)} />}
      {policy && <PrivacyModal onClose={() => setPolicy(false)} />}
    </>
  );
}
