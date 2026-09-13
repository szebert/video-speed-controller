// SPDX-License-Identifier: GPL-3.0-only

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  DEFAULT_THEME,
  getStoredTheme,
  persistTheme,
  readCachedThemePreference,
  resolveColorScheme,
  THEME_PREFERENCE_CACHE_KEY,
} from '../settings/theme';
import { memoryDurable } from './memory-store';

const themeBootSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../public/theme-boot.js'),
  'utf8',
);

describe('theme settings', () => {
  it('defaults to system when storage is empty, unreadable, or rejected', async () => {
    const sync = memoryDurable();
    await expect(getStoredTheme({ sync })).resolves.toBe(DEFAULT_THEME);
    sync.data['pref:theme'] = { schemaVersion: 1, preference: 'nope' };
    await expect(getStoredTheme({ sync })).resolves.toBe(DEFAULT_THEME);
    await expect(
      getStoredTheme({
        sync: {
          ...sync,
          async get() {
            throw new Error('denied');
          },
        },
      }),
    ).resolves.toBe(DEFAULT_THEME);
  });

  it('persists and reads a versioned preference', async () => {
    const sync = memoryDurable();
    await persistTheme('light', { sync });
    await expect(getStoredTheme({ sync })).resolves.toBe('light');
  });

  it('passes through a malformed preference and preserves extras without auto-repair', async () => {
    const sync = memoryDurable();
    const stored = { schemaVersion: 1, preference: 'garbage', futureField: 123 };
    sync.data['pref:theme'] = stored;
    await expect(getStoredTheme({ sync })).resolves.toBe(DEFAULT_THEME);
    expect(sync.data['pref:theme']).toEqual(stored);
    await persistTheme('light', { sync });
    expect(sync.data['pref:theme']).toEqual({
      schemaVersion: 1,
      preference: 'light',
      futureField: 123,
    });
  });

  it('does not overwrite a newer theme schema', async () => {
    const sync = memoryDurable();
    const stored = { schemaVersion: 2, preference: 'light', extra: true };
    sync.data['pref:theme'] = stored;
    await expect(getStoredTheme({ sync })).resolves.toBe(DEFAULT_THEME);
    await expect(persistTheme('dark', { sync })).rejects.toThrow(/newer version/i);
    expect(sync.data['pref:theme']).toEqual(stored);
  });

  it('resolves system to the current color scheme', () => {
    expect(resolveColorScheme('system', true)).toBe('dark');
    expect(resolveColorScheme('system', false)).toBe('light');
    expect(resolveColorScheme('dark', false)).toBe('dark');
  });

  describe('paint cache', () => {
    afterEach(() => {
      localStorage.removeItem(THEME_PREFERENCE_CACHE_KEY);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.style.colorScheme = '';
    });

    it('reads a cached preference and defaults to system', () => {
      expect(readCachedThemePreference()).toBe(DEFAULT_THEME);
      localStorage.setItem(THEME_PREFERENCE_CACHE_KEY, 'light');
      expect(readCachedThemePreference()).toBe('light');
      localStorage.setItem(THEME_PREFERENCE_CACHE_KEY, 'nope');
      expect(readCachedThemePreference()).toBe(DEFAULT_THEME);
    });

    it('applyTheme caches the preference and paints the resolved scheme', () => {
      const root = document.createElement('html');
      applyTheme('light', root);
      expect(localStorage.getItem(THEME_PREFERENCE_CACHE_KEY)).toBe('light');
      expect(root.classList.contains('light')).toBe(true);
      expect(root.style.colorScheme).toBe('light');

      applyTheme('system', root);
      expect(localStorage.getItem(THEME_PREFERENCE_CACHE_KEY)).toBe('system');
      expect(root.classList.contains('dark')).toBe(true);
      expect(root.style.colorScheme).toBe('dark');
    });

    it('keeps the public boot script aligned with the cache key', () => {
      expect(themeBootSource).toContain(THEME_PREFERENCE_CACHE_KEY);
    });

    it('public boot paints from the preference cache before module JS', () => {
      localStorage.setItem(THEME_PREFERENCE_CACHE_KEY, 'light');
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.style.colorScheme = '';
      new Function(themeBootSource)();
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });
  });
});
