// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { enableSite } from '../background/enable-site';
import type { TabStateStore } from '../storage/tab-state';

function memoryTabStore(): TabStateStore & { data: Record<string, unknown> } {
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
    async remove(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) {
        delete data[key];
      }
    },
  };
}

describe('ENABLE_SITE', () => {
  it('seeds tabTarget from siteSpeed without writing storage', async () => {
    const tabStore = memoryTabStore();
    const persist = vi.fn();
    const result = await enableSite(2, 'https://www.youtube.com/watch', {
      tabStore,
      readSpeed: vi.fn(async () => 3.25),
      apply: vi.fn(),
      ensure: vi.fn(),
    });
    expect(result).toEqual({ ok: true, targetSpeed: 3.25 });
    expect(tabStore.data['tab:2']).toEqual({ targetSpeed: 3.25 });
    expect(persist).not.toHaveBeenCalled();
  });

  it('rolls back a provisional tabTarget if apply throws', async () => {
    const tabStore = memoryTabStore();
    const result = await enableSite(2, 'https://www.youtube.com/watch', {
      tabStore,
      readSpeed: vi.fn(async () => 3.25),
      apply: async () => {
        throw new Error('send failed');
      },
      ensure: vi.fn(),
    });
    expect(result).toEqual({ ok: false, error: 'send failed' });
    expect(tabStore.data['tab:2']).toBeUndefined();
  });

  it('rolls back a provisional tabTarget if required injection fails', async () => {
    const tabStore = memoryTabStore();
    const result = await enableSite(2, 'https://www.youtube.com/watch', {
      tabStore,
      readSpeed: vi.fn(async () => 3.25),
      apply: vi.fn(),
      ensure: vi.fn(async () => {
        throw new Error('top-frame injection failed');
      }),
    });
    expect(result.ok).toBe(false);
    expect(tabStore.data['tab:2']).toBeUndefined();
  });
});
