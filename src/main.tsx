import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import './styles.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initStore, isDesktop } from './lib/store';
import { openExternal } from './lib/desktop';
import { startJobRunner } from './lib/jobs';
import { startAutoSync } from './lib/sync';

// Desktop app self-test diagnostics: the app's own local server collects early errors (ignored unless a self-test runs).
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /^473\d\d$/.test(location.port)) {
  const send = (o: unknown) => navigator.sendBeacon?.('/__smoke-log', JSON.stringify(o));
  send({ at: 'start', tauri: '__TAURI_INTERNALS__' in window, isDesktop });
  window.addEventListener('error', (e) => send({ at: 'error', msg: String(e.message), src: e.filename, line: e.lineno }));
  window.addEventListener('unhandledrejection', (e) => send({ at: 'rejection', msg: String((e.reason as Error)?.message ?? e.reason) }));
}

const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </StrictMode>,
  );

initStore()
  .catch(() => undefined)
  .finally(() => {
    render();
    startJobRunner();
    startAutoSync();
    void import('./lib/examReminders').then((m) => m.startExamReminders());
    if (isDesktop) void import('./lib/smoke').then((m) => m.runSmokeTest());
    if (isDesktop) void import('./lib/update').then((m) => m.startUpdateChecks());
  });

// Desktop app: links that would open a new window go to the normal browser instead.
if (isDesktop) {
  const nativeOpen = window.open.bind(window);
  window.open = ((url?: string | URL, ...rest: string[]) => {
    // The Google sign-in for sync needs its own popup.
    if (url && String(url).startsWith('https://accounts.google.com/')) return nativeOpen(url, ...rest);
    if (url) openExternal(String(url));
    return null;
  }) as typeof window.open;
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.('a');
    if (!a || !a.href || a.origin === location.origin) return;
    if (/^(https?:|mailto:)/i.test(a.href)) {
      e.preventDefault();
      openExternal(a.href);
    }
  });
}

// Offline support and "install as app": a service worker caches the whole app after the first visit.
if ('serviceWorker' in navigator && import.meta.env.PROD && /^https?:$/.test(location.protocol) && !isDesktop) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
