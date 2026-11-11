import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { IconEye, IconEyeOff, IconOpenAI, IconSparkle } from '../components/Icons';
import { PROVIDERS, testConnection } from '../lib/ai';
import { getState, setApiKey, setPrivacy, setSettings, useStore, type Provider } from '../lib/store';

export default function Setup() {
  const navigate = useNavigate();
  const settings = useStore((s) => s.data.settings);
  const storedKey = useStore((s) => s.apiKey);
  const privacy = useStore((s) => s.privacy);
  const [provider, setProvider] = useState<Provider>(settings.provider);
  const [key, setKey] = useState(storedKey);
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(privacy.keepKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'KI einrichten – Merkora';
    // Returning visitors who already set things up go straight to their overview.
    if (getState().data.settings.setupDone && new URLSearchParams(location.search).get('stay') === null) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const save = () => {
    setSettings({ provider, setupDone: true, model: provider === settings.provider ? settings.model : '' });
    if (remember !== privacy.keepKey) setPrivacy({ keepKey: remember, keepData: remember || privacy.keepData, consent: privacy.consent === 'unset' ? 'custom' : privacy.consent });
    setApiKey(key);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!key.trim() && provider !== 'custom') {
      setError('Bitte füge deinen API-Key ein. Ohne Key kannst du Merkora auch erst einmal ohne KI ausprobieren.');
      return;
    }
    save();
    setBusy(true);
    try {
      await testConnection();
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (p: Provider) => {
    setProvider(p);
    setError('');
    document.getElementById('apikey')?.focus();
  };

  return (
    <AuthLayout variant="setup">
      <section className="auth-card">
        <h2 className="auth-title">KI einrichten</h2>
        <button
          type="button"
          className="social-btn free"
          onClick={() => {
            setSettings({ setupDone: true });
            navigate('/dashboard');
          }}
        >
          <IconSparkle size={22} />
          <span className="lg-only">Erst einmal ohne KI umschauen</span>
          <span className="sm-only">Ohne KI starten</span>
        </button>
        <button type="button" className={`social-btn ${provider === 'openai' ? 'picked' : ''}`} onClick={() => pick('openai')}>
          <IconOpenAI size={24} />
          <span className="lg-only">Mit OpenAI-Key fortfahren</span>
          <span className="sm-only">Weiter mit OpenAI</span>
        </button>
        <div className="divider" role="separator">
          <span className="lg-only">Oder eigenen Key eintragen</span>
          <span className="sm-only">oder</span>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label className="field-label" htmlFor="provider">
            Anbieter
          </label>
          <select id="provider" className="input" value={provider} onChange={(e) => pick(e.target.value as Provider)}>
            {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDERS[p].label}
              </option>
            ))}
          </select>
          <div className="label-row">
            <label className="field-label" htmlFor="apikey">
              API-Key
            </label>
            <Link to="/forgot-password" className="small-link">
              API-Key vergessen?
            </Link>
          </div>
          <div className="input-wrap">
            <input
              id="apikey"
              name="apikey"
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder={`Füge deinen Key ein (${PROVIDERS[provider].keyHint})`}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button type="button" className="eye" aria-label={show ? 'Key verbergen' : 'Key anzeigen'} onClick={() => setShow(!show)}>
              {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Key auf diesem Gerät merken, damit ich ihn nicht neu eingeben muss. Jederzeit löschbar.</span>
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}{' '}
              <button type="button" className="link-btn" onClick={() => navigate('/dashboard')}>
                Trotzdem weiter
              </button>
            </div>
          )}
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? 'Verbindung wird geprüft …' : 'Loslegen'}
          </button>
        </form>
        <p className="auth-alt">
          Erst einmal nur umschauen?{' '}
          <button
            type="button"
            onClick={() => {
              setSettings({ setupDone: true });
              navigate('/dashboard');
            }}
          >
            Weiter
          </button>
        </p>
      </section>
    </AuthLayout>
  );
}
