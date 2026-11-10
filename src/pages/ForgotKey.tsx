import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { PROVIDERS } from '../lib/ai';
import { useStore, type Provider } from '../lib/store';

export default function ForgotKey() {
  const current = useStore((s) => s.data.settings.provider);
  const [provider, setProvider] = useState<Provider | ''>('');
  const [shown, setShown] = useState<Provider | null>(null);

  useEffect(() => {
    document.title = 'API-Key vergessen? – Merkora';
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = (provider || current) as Provider;
    setShown(p);
    window.open(PROVIDERS[p].keyUrl, '_blank', 'noopener');
  };

  return (
    <AuthLayout variant="forgot">
      <div className="forgot-wrap">
        <section className="auth-card forgot-card">
          <form className="forgot-form" onSubmit={submit}>
            <h2 className="auth-title left">API-Key vergessen?</h2>
            <label htmlFor="fp-provider" className="forgot-q">
              Bei welchem Anbieter brauchst du einen neuen API-Key?
            </label>
            <select
              id="fp-provider"
              className={`input ${provider ? '' : 'placeholder'}`}
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              <option value="" disabled>
                Wähle deinen KI-Anbieter aus
              </option>
              {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDERS[p].label}
                </option>
              ))}
            </select>
            <div className="forgot-gap" />
            <button type="submit" className="btn primary block">
              Weiter zum Anbieter
            </button>
          </form>
          {shown && (
            <div className="forgot-steps">
              <p>
                Wir haben die Seite von <b>{PROVIDERS[shown].short}</b> in einem neuen Tab geöffnet. So geht's:
              </p>
              <ol>
                {PROVIDERS[shown].steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <p>
                Schlüssel verloren? Lösch den alten beim Anbieter und erstelle einfach einen neuen. Danach{' '}
                <Link to="/?stay">hier eintragen</Link>.
              </p>
            </div>
          )}
        </section>
      </div>
    </AuthLayout>
  );
}
