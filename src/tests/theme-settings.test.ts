// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { DARK_DEFAULT, getStoredTheme, persistTheme, resolveColorScheme } from '../settings/theme';
import { memoryDurable } from './memory-store';

describe('theme settings', () => {
  it('defaults to dark when storage is empty, unreadable, or rejected', async () => {
    const sync = memoryDurable();
    await expect(getStoredTheme({ sync })).resolves.toBe(DARK_DEFAULT);
    sync.data['pref:theme'] = { schemaVersion: 1, preference: 'nope' };
    await expect(getStoredTheme({ sync })).resolves.toBe(DARK_DEFAULT);
    await expect(
      getStoredTheme({
        sync: {
          ...sync,
          async get() {
            throw new Error('denied');
          },
        },
      }),
    ).resolves.toBe(DARK_DEFAULT);
  });

  it('persists and reads a versioned preference', async () => {
    const sync = memoryDurable();
    await persistTheme('light', { sync });
    await expect(getStoredTheme({ sync })).resolves.toBe('light');
  });

  it('resolves system to the current color scheme', () => {
    expect(resolveColorScheme('system', true)).toBe('dark');
    expect(resolveColorScheme('system', false)).toBe('light');
    expect(resolveColorScheme('dark', false)).toBe('dark');
  });
});
