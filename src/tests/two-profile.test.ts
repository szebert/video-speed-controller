// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { displaySpeed } from '../core/speed';
import { persistSiteSpeed, readSiteSpeed } from '../storage/site-settings';
import { resetStorageMutationQueue } from '../storage/storage-mutation-queue';
import { memoryDurable } from './memory-store';

describe('two-profile display and storage', () => {
  beforeEach(() => {
    resetStorageMutationQueue();
  });

  it('shows stored siteSpeed with the toggle off when the profile has no permission', async () => {
    const profileB = {
      sync: memoryDurable({
        'site:www.youtube.com': {
          schemaVersion: 1,
          lastUsedAt: 1,
          overrides: { speed: { kind: 'value', value: 3.25, updatedAt: 1 } },
        },
      }),
      local: memoryDurable(),
      now: () => 1,
    };
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
    const profileA = {
      sync: memoryDurable(),
      local: memoryDurable(),
      now: () => 10,
    };
    await persistSiteSpeed('https://www.youtube.com/watch', 3.25, profileA);
    const profileB = {
      sync: memoryDurable({ ...profileA.sync.data }),
      local: memoryDurable({ ...profileA.local.data }),
      now: () => 10,
    };
    expect(profileB.sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'value', value: 3.25, updatedAt: 10 } },
    });
    await persistSiteSpeed('https://www.youtube.com/watch', 3, {
      ...profileA,
      now: () => 20,
    });
    expect(profileB.sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'value', value: 3.25, updatedAt: 10 } },
    });
    expect(profileA.sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'value', value: 3, updatedAt: 20 } },
    });
  });
});
