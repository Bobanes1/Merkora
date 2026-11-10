/** Light/dark mode: follows the setting, or the system when set to "system". */
import { useEffect, useSyncExternalStore } from 'react';
import { useStore } from './store';

const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
const subscribeSystem = (l: () => void) => {
  media?.addEventListener?.('change', l);
  return () => {
    media?.removeEventListener?.('change', l);
  };
};

/** The theme in use right now ("light" or "dark"). */
export function useResolvedTheme(): 'light' | 'dark' {
  const setting = useStore((s) => s.data.settings.theme ?? 'system');
  const systemDark = useSyncExternalStore(subscribeSystem, () => !!media?.matches);
  return setting === 'system' ? (systemDark ? 'dark' : 'light') : setting;
}

/** Puts the theme on <html data-theme> so the CSS tokens switch. */
export function useApplyTheme() {
  const theme = useResolvedTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}

export const isDarkNow = () => document.documentElement.dataset.theme === 'dark';
