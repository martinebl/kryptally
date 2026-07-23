import { isTauri } from '$lib/runtime';
import { getCurrentWindow } from '@tauri-apps/api/window';

export type ThemeMode = 'light' | 'dark' | 'system';

export const STORAGE_KEY = 'kryptally-theme';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export const getStoredMode = (): ThemeMode => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
};

export const setStoredMode = (mode: ThemeMode): void => {
  localStorage.setItem(STORAGE_KEY, mode);
};

export const resolveIsDark = (mode: ThemeMode): boolean =>
  mode === 'dark' || (mode === 'system' && window.matchMedia(DARK_MEDIA_QUERY).matches);

export const applyTheme = (mode: ThemeMode): void => {
  document.documentElement.classList.toggle('dark', resolveIsDark(mode));

  if (isTauri()) {
    const win = getCurrentWindow();

    win.setTheme(mode === 'system' ? null : mode).catch((e) => console.error('Failed to sync native title bar theme', e));

    // `prefers-color-scheme` does not reliably track the OS theme in Tauri's Linux
    // WebView (WebKitGTK), so ask the window for the theme it resolved natively instead.
    if (mode === 'system') {
      win
        .theme()
        .then((theme) => {
          if (theme) document.documentElement.classList.toggle('dark', theme === 'dark');
        })
        .catch((e) => console.error('Failed to read native system theme', e));
    }
  }
};

export const setTheme = (mode: ThemeMode): void => {
  setStoredMode(mode);
  applyTheme(mode);
};

export const initTheme = (): void => {
  applyTheme(getStoredMode());

  window.matchMedia(DARK_MEDIA_QUERY).addEventListener('change', () => {
    if (getStoredMode() === 'system') applyTheme('system');
  });

  if (isTauri()) {
    getCurrentWindow().onThemeChanged(({ payload: theme }) => {
      if (getStoredMode() === 'system') document.documentElement.classList.toggle('dark', theme === 'dark');
    });
  }
};
