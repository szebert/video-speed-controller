// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { resetSiteSpeed } from '../background/reset-site-speed';
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

describe('RESET_SITE_SPEED', () => {
  it('applies the prospective inherited speed then persists inherit', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:4': { targetSpeed: 1.5 } });
    const persistInherit = vi.fn(async () => undefined);
    const apply = vi.fn();
    const result = await resetSiteSpeed(4, 'https://www.youtube.com/watch', {
      tabStore,
      resolveSpeed: async () => 1.25,
      persistInherit,
      apply,
      ensure: vi.fn(),
    });
    expect(result).toEqual({ ok: true, targetSpeed: 1.25 });
    expect(apply).toHaveBeenCalledWith(4, 1.25);
    expect(persistInherit).toHaveBeenCalledTimes(1);
    expect(tabStore.data['tab:4']).toEqual({ targetSpeed: 1.25 });
  });

  it('restores the previous tab target and does not persist when ensure fails', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:4': { targetSpeed: 1.5 } });
    const persistInherit = vi.fn();
    const result = await resetSiteSpeed(4, 'https://www.youtube.com/watch', {
      tabStore,
      resolveSpeed: async () => 1.25,
      persistInherit,
      apply: vi.fn(),
      ensure: vi.fn(async () => {
        throw new Error('top-frame injection failed');
      }),
    });
    expect(result).toEqual({ ok: false, error: 'top-frame injection failed' });
    expect(tabStore.data['tab:4']).toEqual({ targetSpeed: 1.5 });
    expect(persistInherit).not.toHaveBeenCalled();
  });

  it('restores the previous tab target when apply throws', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:4': { targetSpeed: 1.5 } });
    const persistInherit = vi.fn();
    const result = await resetSiteSpeed(4, 'https://www.youtube.com/watch', {
      tabStore,
      resolveSpeed: async () => 1.25,
      persistInherit,
      apply: async () => {
        throw new Error('send failed');
      },
      ensure: vi.fn(),
    });
    expect(result).toEqual({ ok: false, error: 'send failed' });
    expect(tabStore.data['tab:4']).toEqual({ targetSpeed: 1.5 });
    expect(persistInherit).not.toHaveBeenCalled();
  });

  it('keeps the applied target when persist fails', async () => {
    const tabStore = memoryTabStore();
    const apply = vi.fn();
    const result = await resetSiteSpeed(4, 'https://www.youtube.com/watch', {
      tabStore,
      resolveSpeed: async () => 1.25,
      persistInherit: async () => {
        throw new Error('quota');
      },
      apply,
      ensure: vi.fn(),
    });
    expect(result).toEqual({ ok: true, targetSpeed: 1.25, persistError: 'quota' });
    expect(apply).toHaveBeenCalledWith(4, 1.25);
    expect(tabStore.data['tab:4']).toEqual({ targetSpeed: 1.25 });
  });
});
