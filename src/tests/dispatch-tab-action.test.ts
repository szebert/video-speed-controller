// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { dispatchTabAction } from '../background/dispatch-tab-action';
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

function sender(tab?: { id?: number; url?: string }): chrome.runtime.MessageSender {
  return { tab: tab as chrome.tabs.Tab };
}

describe('dispatchTabAction', () => {
  it('routes increase and decrease through adjustTabSpeed', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:4': tabBehavior(1) });
    const apply = vi.fn();
    const persist = vi.fn();
    const deps = { tabStore, apply, persist, ensure: vi.fn() };
    await expect(
      dispatchTabAction(sender({ id: 4, url: 'https://example.com/watch' }), 'increaseSpeed', deps),
    ).resolves.toEqual({ ok: true, targetSpeed: 1.25 });
    await expect(
      dispatchTabAction(sender({ id: 4, url: 'https://example.com/watch' }), 'decreaseSpeed', deps),
    ).resolves.toEqual({ ok: true, targetSpeed: 1 });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('resets the tab to 1× without writing site or global settings', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:4': tabBehavior(1.75) });
    const apply = vi.fn();
    const persist = vi.fn();
    const result = await dispatchTabAction(
      sender({ id: 4, url: 'https://example.com/watch' }),
      'resetSpeed',
      { tabStore, apply, persist, ensure: vi.fn() },
    );
    expect(result).toEqual({ ok: true, targetSpeed: 1 });
    expect(tabStore.data['tab:4']).toEqual(tabBehavior(1));
    expect(apply).toHaveBeenCalledWith(4, tabBehavior(1));
    expect(persist).not.toHaveBeenCalled();
  });
});
