// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { persistSiteSpeed, readSiteSpeed } from '../storage/site-settings';
import type { SiteSettingsStore } from '../storage/site-settings';

function memorySync(): SiteSettingsStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) {
      if (typeof keys === 'string') {
        return { [keys]: data[keys] };
      }
      return { ...data };
    },
    async set(items) {
      Object.assign(data, items);
    },
  };
}

describe('site settings', () => {
  it('reads without rewriting stored records', async () => {
    const store = memorySync();
    store.data['site:www.youtube.com'] = { schemaVersion: 1, speed: 3.25 };
    await expect(readSiteSpeed('https://www.youtube.com/watch', store)).resolves.toBe(3.25);
    expect(store.data['site:www.youtube.com']).toEqual({ schemaVersion: 1, speed: 3.25 });
  });

  it('does not create keys for unsupported pages', async () => {
    const store = memorySync();
    await expect(readSiteSpeed('chrome://settings', store)).resolves.toBeNull();
    expect(store.data).toEqual({});
    await expect(persistSiteSpeed('chrome://settings', 2, store)).rejects.toThrow(/unsupported/);
  });
});
