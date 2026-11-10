import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import SyncCallback from './pages/SyncCallback';
import { AppLayout } from './components/AppLayout';
import { ConsentBanner } from './components/Consent';
import { Toaster } from './components/Jobs';
import { AnkiDropHost } from './components/AnkiDropHost';
import Dashboard from './pages/Dashboard';
import DeckPage from './pages/Deck';
import ForgotKey from './pages/ForgotKey';
import Library from './pages/Library';
import Settings from './pages/Settings';
import CalendarPage from './pages/Calendar';
import Stats from './pages/Stats';
import Setup from './pages/Setup';
import { useStore } from './lib/store';

/** First visit: ask for the AI key (skippable) before showing the overview – instead of a login. */
function DashboardGate() {
  const needsSetup = useStore((s) => !s.data.settings.setupDone && !s.apiKey);
  if (needsSetup) return <Setup />;
  return (
    <AppLayout>
      <Dashboard />
    </AppLayout>
  );
}

function useMotionSetting() {
  const on = useStore((s) => s.data.settings.animations);
  useEffect(() => {
    document.documentElement.classList.toggle('no-anim', !on);
  }, [on]);
}

export default function App() {
  useMotionSetting();
  return (
    <>
      <Routes>
        <Route path="/" element={<Setup />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/forgot-password" element={<ForgotKey />} />
        <Route path="/dashboard" element={<DashboardGate />} />
        <Route path="/library" element={<AppLayout><Library /></AppLayout>} />
        <Route path="/library/:ws" element={<AppLayout><Library /></AppLayout>} />
        <Route path="/library/:ws/:course" element={<AppLayout><Library /></AppLayout>} />
        <Route path="/library/:ws/:course/:deck" element={<AppLayout><DeckPage /></AppLayout>} />
        <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
        <Route path="/calendar" element={<AppLayout><CalendarPage /></AppLayout>} />
        <Route path="/stats" element={<AppLayout><Stats /></AppLayout>} />
        <Route path="/sync-callback" element={<SyncCallback />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <ConsentBanner />
      <Toaster />
      <AnkiDropHost />
    </>
  );
}
