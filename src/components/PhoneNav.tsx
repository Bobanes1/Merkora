import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { IconCalendar, IconChart, IconHome, IconLibrary, IconPlus, IconPractice, IconSearch, IconSettings } from './Icons';
import { Pomodoro } from './Pomodoro';
import { Sheet } from './Sheet';

/** Phone view: navigation at the bottom (Start, Bibliothek, Skills, Prüfungen, Mehr); "Mehr" opens a panel with the rest. */
export function PhoneNav({ onSearch, onNewDeck }: { onSearch: () => void; onNewDeck: () => void }) {
  const [more, setMore] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inMore = pathname.startsWith('/stats') || pathname.startsWith('/settings');
  const go = (to: string) => {
    setMore(false);
    navigate(to);
  };
  const item = (to: string, label: string, icon: JSX.Element, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => 'pn-item' + (isActive ? ' on' : '')}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
  return (
    <>
      <nav className="phone-nav" aria-label="Hauptnavigation">
        {item('/dashboard', 'Start', <IconHome size={22} />)}
        {item('/library', 'Bibliothek', <IconLibrary size={22} />)}
        {item('/skills', 'Skills', <IconPractice size={22} />)}
        {item('/calendar', 'Prüfungen', <IconCalendar size={22} />)}
        <button type="button" className={'pn-item' + (inMore || more ? ' on' : '')} aria-expanded={more} onClick={() => setMore(true)}>
          <span className="pn-dots" aria-hidden="true">
            •••
          </span>
          <span>Mehr</span>
        </button>
      </nav>
      {more && (
        <Sheet title="Mehr" onClose={() => setMore(false)}>
          <div className="sheet-list">
            <button type="button" onClick={() => (setMore(false), onSearch())}>
              <IconSearch size={20} /> Suchen
            </button>
            <button type="button" onClick={() => (setMore(false), onNewDeck())}>
              <IconPlus size={20} /> Neues Deck
            </button>
            <button type="button" onClick={() => go('/stats')}>
              <IconChart size={20} /> Statistik
            </button>
            <button type="button" onClick={() => go('/settings')}>
              <IconSettings size={20} /> Einstellungen
            </button>
          </div>
          <div className="sheet-pomo">
            <Pomodoro big />
          </div>
        </Sheet>
      )}
    </>
  );
}
