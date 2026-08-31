// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { enableSite } from '../background/enable-site';
import type { TabStateStore } from '../storage/tab-state';
import { tabBehavior } from './tab-behavior-fixture';

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
  it('seeds full applied behavior without writing durable storage', async () => {
    const tabStore = memoryTabStore();
    const persist = vi.fn();
    const seeded = tabBehavior(3.25);
    const apply = vi.fn();
    const result = await enableSite(2, 'https://www.youtube.com/watch', {
      tabStore,
      readBehavior: vi.fn(async () => seeded),
      apply,
      ensure: vi.fn(),
    });
    expect(result).toEqual({ ok: true, targetSpeed: 3.25 });
    expect(tabStore.data['tab:2']).toEqual(seeded);
    expect(apply).toHaveBeenCalledWith(2, seeded);
    expect(persist).not.toHaveBeenCalled();
  });

  it('reapplies existing full tab state', async () => {
    const tabStore = memoryTabStore();
    const existing = tabBehavior(1.75);
    await tabStore.set({ 'tab:2': existing });
    const apply = vi.fn();
    const readBehavior = vi.fn(async () => tabBehavior(3));
    const result = await enableSite(2, 'https://www.youtube.com/watch', {
      tabStore,
      readBehavior,
      apply,
      ensure: vi.fn(),
    });
    expect(result).toEqual({ ok: true, targetSpeed: 1.75 });
    expect(readBehavior).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(2, existing);
    expect(tabStore.data['tab:2']).toEqual(existing);
  });

  it('does not create tab state when a behavior read fails', async () => {
    const tabStore = memoryTabStore();
    const apply = vi.fn();
    const ensure = vi.fn();
    const result = await enableSite(2, 'https://www.youtube.com/watch', {
      tabStore,
      readBehavior: vi.fn(async () => {
        throw new Error('offline');
      }),
      apply,
      ensure,
    });
    expect(result).toEqual({ ok: false, error: 'offline' });
    expect(tabStore.data['tab:2']).toBeUndefined();
    expect(ensure).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('rolls back a provisional tabTarget if apply throws', async () => {
    const tabStore = memoryTabStore();
    const result = await enableSite(2, 'https://www.youtube.com/watch', {
      tabStore,
      readBehavior: vi.fn(async () => tabBehavior(3.25)),
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
      readBehavior: vi.fn(async () => tabBehavior(3.25)),
      apply: vi.fn(),
      ensure: vi.fn(async () => {
        throw new Error('top-frame injection failed');
      }),
    });
    expect(result.ok).toBe(false);
    expect(tabStore.data['tab:2']).toBeUndefined();
  });
});
