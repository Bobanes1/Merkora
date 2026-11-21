import { useEffect, useState } from 'react';
import { canInstallJava, installJava, javaBuiltin, javaOffer, localJava, sizeText, uninstallJava } from '../lib/javaRun';
import { IconCheck, IconDownload, IconTrash } from './Icons';

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'missing'; offer?: { version: string; size: number }; error?: string }
  | { kind: 'installing'; progress: number }
  | { kind: 'ready'; version: string; builtin: boolean };

/**
 * Java on this PC: shows what is there, installs Merkora's own Java with one click (progress bar),
 * or removes it again. On the phone / in the browser it shows nothing.
 */
export function JavaSetup({ onReady, compact = false }: { onReady?: (version: string) => void; compact?: boolean }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const refresh = async () => {
    if (!(await canInstallJava())) return setState({ kind: 'unavailable' });
    const v = await localJava();
    if (v) return setState({ kind: 'ready', version: v, builtin: await javaBuiltin() });
    setState({ kind: 'missing' });
    javaOffer()
      .then((offer) => setState((s) => (s.kind === 'missing' ? { ...s, offer } : s)))
      .catch(() => undefined);
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async () => {
    setState({ kind: 'installing', progress: 0 });
    try {
      const version = await installJava((p) => setState({ kind: 'installing', progress: p }));
      setState({ kind: 'ready', version, builtin: true });
      onReady?.(version);
    } catch (e) {
      setState({ kind: 'missing', error: String((e as Error)?.message ?? e) });
    }
  };
  const remove = async () => {
    await uninstallJava();
    await refresh();
  };

  if (state.kind === 'loading' || state.kind === 'unavailable') return null;
  if (state.kind === 'ready') {
    if (compact) return null;
    return (
      <div className="java-setup ready">
        <IconCheck size={16} />
        <span className="grow">
          Java {state.version} ist {state.builtin ? 'in Merkora installiert' : 'auf diesem PC installiert'} – dein Code läuft direkt hier, schnell und ohne Internet.
        </span>
        {state.builtin && (
          <button type="button" className="btn ghost sm" onClick={() => void remove()} title="Merkoras eigenes Java wieder löschen">
            <IconTrash size={14} /> Entfernen
          </button>
        )}
      </div>
    );
  }
  if (state.kind === 'installing') {
    const pct = Math.round(state.progress * 100);
    return (
      <div className="java-setup busy" role="status">
        <b>{state.progress < 0.9 ? `Java wird heruntergeladen … ${Math.round((pct / 90) * 100)} %` : 'Java wird eingerichtet …'}</b>
        <span className="java-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
        <small className="muted">Du kannst währenddessen weiterlernen.</small>
      </div>
    );
  }
  return (
    <div className="java-setup">
      <span className="grow">
        <b>Java direkt in Merkora installieren</b>
        <small>
          Ein Klick – dann läuft dein Code hier auf dem PC, viel schneller als online und ohne Internet.
          {state.offer ? ` Einmalig ca. ${sizeText(state.offer.size)} (Java ${state.offer.version.split('+')[0]} von Eclipse Adoptium).` : ' Offizielles Java 21 von Eclipse Adoptium.'}
          {' '}Keine Admin-Rechte nötig, jederzeit wieder entfernbar.
        </small>
        {state.error && <small className="err-msg">{state.error}</small>}
      </span>
      <button type="button" className="btn primary sm" onClick={() => void install()}>
        <IconDownload size={14} /> {state.error ? 'Nochmal versuchen' : 'Java installieren'}
      </button>
    </div>
  );
}
