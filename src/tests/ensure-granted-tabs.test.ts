// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { ensureEnginesOnGrantedTabs } from '../background/ensure-granted-tabs';

describe('ensureEnginesOnGrantedTabs', () => {
  it('injects only tabs whose URLs are covered by the granted host patterns', async () => {
    const ensure = vi.fn();
    await ensureEnginesOnGrantedTabs(['https://www.youtube.com:443/*'], {
      tabs: {
        query: async () => [
          { id: 4, url: 'https://www.youtube.com/watch?v=1' },
          { id: 5, url: 'https://example.com/' },
          { id: 6 },
        ],
      },
      ensure,
    });
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledWith(4, undefined);
  });

  it('skips work when no host patterns remain', async () => {
    const query = vi.fn();
    const ensure = vi.fn();
    await ensureEnginesOnGrantedTabs([], { tabs: { query }, ensure });
    expect(query).not.toHaveBeenCalled();
    expect(ensure).not.toHaveBeenCalled();
  });

  it('continues when one granted tab rejects injection', async () => {
    const ensure = vi.fn(async (tabId: number) => {
      if (tabId === 4) {
        throw new Error('top frame blocked');
      }
    });
    await expect(
      ensureEnginesOnGrantedTabs(
        ['https://www.youtube.com:443/*', 'https://music.youtube.com:443/*'],
        {
          tabs: {
            query: async () => [
              { id: 4, url: 'https://www.youtube.com/watch' },
              { id: 8, url: 'https://music.youtube.com/' },
            ],
          },
          ensure,
        },
      ),
    ).resolves.toBeUndefined();
    expect(ensure).toHaveBeenCalledTimes(2);
  });
});
