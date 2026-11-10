import { Component, type ErrorInfo, type ReactNode } from 'react';
import { flush } from '../lib/store';

type Props = { children: ReactNode; /** Smaller box inside the page instead of a full-screen message. */ inline?: boolean };
type State = { error: Error | null };

/**
 * Safety net: if a part of the app crashes, a message with "try again" is shown instead of a white window.
 * The learning data is saved first, so nothing gets lost.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Merkora: Fehler in der Oberfläche', error, info.componentStack);
    void flush();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={this.props.inline ? 'crash-box inline' : 'crash-box'} role="alert">
        <b>Hier ist etwas schiefgelaufen.</b>
        <p className="muted">Dein Lernstand ist gespeichert. Versuch es nochmal – meistens reicht das.</p>
        <details>
          <summary>Technische Details</summary>
          <code>{String(error.message || error)}</code>
        </details>
        <div className="row-gap center">
          <button type="button" className="btn primary" onClick={() => this.setState({ error: null })}>
            Nochmal versuchen
          </button>
          <button type="button" className="btn outline" onClick={() => location.reload()}>
            App neu laden
          </button>
        </div>
      </div>
    );
  }
}
