// SPDX-License-Identifier: GPL-3.0-only

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { THEME_KEY } from '@/settings/site-behavior';
import { applyTheme, parseThemeRecord, persistTheme, type ThemePreference } from '@/settings/theme';

type ThemeContextValue = {
  theme: ThemePreference;
  setTheme: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemePreference;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);

  const setTheme = useCallback((preference: ThemePreference) => {
    setThemeState(preference);
    applyTheme(preference);
    void persistTheme(preference).catch(() => {
      // Apply immediately even if the Sync write fails.
    });
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== 'sync' || !changes[THEME_KEY]) {
        return;
      }
      const parsed = parseThemeRecord(changes[THEME_KEY].newValue);
      if (!parsed) {
        return;
      }
      setThemeState(parsed.preference);
      applyTheme(parsed.preference);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  useEffect(() => {
    if (theme !== 'system') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSchemeChange = () => {
      applyTheme('system');
    };
    media.addEventListener('change', onSchemeChange);
    return () => {
      media.removeEventListener('change', onSchemeChange);
    };
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return value;
}
