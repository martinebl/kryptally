import { describe, it, expect, vi, beforeEach } from 'vitest';

const setThemeMock = vi.fn(() => Promise.resolve());
let tauriEnabled = false;
let nativeTheme: 'light' | 'dark' | null = null;
let themeChangedListener: ((event: { payload: 'light' | 'dark' }) => void) | undefined;

vi.mock('$lib/runtime', () => ({
  isTauri: () => tauriEnabled,
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setTheme: setThemeMock,
    theme: () => Promise.resolve(nativeTheme),
    onThemeChanged: vi.fn((handler: (event: { payload: 'light' | 'dark' }) => void) => {
      themeChangedListener = handler;
      return Promise.resolve(() => {});
    }),
  }),
}));

import { getStoredMode, setStoredMode, resolveIsDark, applyTheme, setTheme, initTheme, STORAGE_KEY } from '$lib/theme/theme';

const fakeClassList = () => {
  const classes = new Set<string>();
  return {
    classes,
    toggle: vi.fn((name: string, force?: boolean) => {
      const shouldHave = force ?? !classes.has(name);
      if (shouldHave) classes.add(name);
      else classes.delete(name);
      return shouldHave;
    }),
  };
};

const fakeStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
};

let matchMediaMatches = false;
let mediaChangeListener: (() => void) | undefined;
let classList: ReturnType<typeof fakeClassList>;

const stubBrowserGlobals = () => {
  vi.stubGlobal('localStorage', fakeStorage());
  classList = fakeClassList();
  vi.stubGlobal('document', { documentElement: { classList } });
  mediaChangeListener = undefined;
  vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
      matches: matchMediaMatches,
      addEventListener: vi.fn((_event: string, listener: () => void) => {
        mediaChangeListener = listener;
      }),
    })),
  });
};

describe('theme', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setThemeMock.mockClear();
    tauriEnabled = false;
    matchMediaMatches = false;
    nativeTheme = null;
    themeChangedListener = undefined;
    stubBrowserGlobals();
  });

  describe('resolveIsDark', () => {
    it('is true for dark mode', () => {
      expect(resolveIsDark('dark')).toBe(true);
    });

    it('is false for light mode', () => {
      expect(resolveIsDark('light')).toBe(false);
    });

    it('follows the OS preference for system mode', () => {
      matchMediaMatches = true;
      expect(resolveIsDark('system')).toBe(true);

      matchMediaMatches = false;
      expect(resolveIsDark('system')).toBe(false);
    });
  });

  describe('getStoredMode / setStoredMode', () => {
    it('defaults to system when nothing is stored', () => {
      expect(getStoredMode()).toBe('system');
    });

    it('round-trips a stored mode', () => {
      setStoredMode('dark');
      expect(getStoredMode()).toBe('dark');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    });

    it('falls back to system for an invalid stored value', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid');
      expect(getStoredMode()).toBe('system');
    });
  });

  describe('applyTheme', () => {
    it('adds the dark class for dark mode', () => {
      applyTheme('dark');
      expect(classList.classes.has('dark')).toBe(true);
    });

    it('removes the dark class for light mode', () => {
      classList.classes.add('dark');
      applyTheme('light');
      expect(classList.classes.has('dark')).toBe(false);
    });

    it('does not sync the native title bar outside Tauri', () => {
      applyTheme('dark');
      expect(setThemeMock).not.toHaveBeenCalled();
    });

    it('syncs the native title bar theme inside Tauri', () => {
      tauriEnabled = true;
      applyTheme('dark');
      expect(setThemeMock).toHaveBeenCalledWith('dark');

      applyTheme('system');
      expect(setThemeMock).toHaveBeenCalledWith(null);
    });

    it('corrects system mode to the native OS theme inside Tauri, overriding an unreliable matchMedia result', async () => {
      tauriEnabled = true;
      matchMediaMatches = false;
      nativeTheme = 'dark';

      applyTheme('system');
      expect(classList.classes.has('dark')).toBe(false);

      await vi.waitFor(() => expect(classList.classes.has('dark')).toBe(true));
    });

    it('does not override an explicit mode with the native theme', async () => {
      tauriEnabled = true;
      nativeTheme = 'dark';

      applyTheme('light');
      await Promise.resolve();
      await Promise.resolve();
      expect(classList.classes.has('dark')).toBe(false);
    });
  });

  describe('setTheme', () => {
    it('persists the mode and applies it', () => {
      setTheme('dark');
      expect(getStoredMode()).toBe('dark');
      expect(classList.classes.has('dark')).toBe(true);
    });
  });

  describe('initTheme', () => {
    it('applies the currently stored mode on init', () => {
      setStoredMode('dark');
      initTheme();
      expect(classList.classes.has('dark')).toBe(true);
    });

    it('re-applies the theme on OS changes only while in system mode', () => {
      setStoredMode('system');
      initTheme();

      matchMediaMatches = true;
      mediaChangeListener?.();
      expect(classList.classes.has('dark')).toBe(true);
    });

    it('ignores OS changes while an explicit mode is stored', () => {
      setStoredMode('light');
      initTheme();

      matchMediaMatches = true;
      mediaChangeListener?.();
      expect(classList.classes.has('dark')).toBe(false);
    });

    it('reacts to native theme-change events inside Tauri while in system mode', () => {
      tauriEnabled = true;
      setStoredMode('system');
      initTheme();

      themeChangedListener?.({ payload: 'dark' });
      expect(classList.classes.has('dark')).toBe(true);
    });

    it('ignores native theme-change events inside Tauri while an explicit mode is stored', () => {
      tauriEnabled = true;
      setStoredMode('light');
      initTheme();

      themeChangedListener?.({ payload: 'dark' });
      expect(classList.classes.has('dark')).toBe(false);
    });
  });
});
