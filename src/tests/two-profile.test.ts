// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { displaySpeed } from '../core/speed';
import { persistSiteSpeed, readSiteSpeed, type SiteSettingsStore } from '../storage/site-settings';

function memorySync(
  initial: Record<string, unknown> = {},
): SiteSettingsStore & { data: Record<string, unknown> } {
  const data = { ...initial };
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

describe('two-profile display and storage', () => {
  it('shows stored siteSpeed with the toggle off when the profile has no permission', async () => {
    const profileB = memorySync({
      'site:www.youtube.com': { schemaVersion: 1, speed: 3.25 },
    });
    await expect(readSiteSpeed('https://www.youtube.com/watch', profileB)).resolves.toBe(3.25);
    expect(
      displaySpeed({
        siteAccess: false,
        siteSpeed: 3.25,
        tabTarget: null,
      }),
    ).toBe(3.25);
  });

  it('keeps two tab targets independent after a speed change', () => {
    expect(displaySpeed({ siteAccess: true, siteSpeed: 3, tabTarget: 2 })).toBe(2);
    expect(displaySpeed({ siteAccess: true, siteSpeed: 3, tabTarget: 3 })).toBe(3);
  });

  it('writes one site record without rewriting another profile copy', async () => {
    const profileA = memorySync();
    await persistSiteSpeed('https://www.youtube.com/watch', 3.25, profileA);
    const profileB = memorySync({ ...profileA.data });
    expect(profileB.data['site:www.youtube.com']).toEqual({ schemaVersion: 1, speed: 3.25 });
    await persistSiteSpeed('https://www.youtube.com/watch', 3, profileA);
    expect(profileB.data['site:www.youtube.com']).toEqual({ schemaVersion: 1, speed: 3.25 });
  });
});
