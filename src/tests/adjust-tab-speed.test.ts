// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { adjustTabSpeed } from '../background/adjust-tab-speed';
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

describe('adjustTabSpeed', () => {
  it('reads the latest tab state and delegates +1 through setSpeed', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:4': tabBehavior(1) });
    const apply = vi.fn();
    const persist = vi.fn();
    const result = await adjustTabSpeed(sender({ id: 4, url: 'https://example.com/watch' }), 1, {
      tabStore,
      apply,
      persist,
      ensure: vi.fn(),
    });
    expect(result).toEqual({ ok: true, targetSpeed: 1.25 });
    expect(apply).toHaveBeenCalledWith(4, tabBehavior(1.25));
    expect(persist).toHaveBeenCalledWith('https://example.com/watch', 1.25);
  });

  it('clamps at the policy max', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:4': tabBehavior(4) });
    const apply = vi.fn();
    const result = await adjustTabSpeed(sender({ id: 4, url: 'https://example.com/watch' }), 1, {
      tabStore,
      apply,
      persist: vi.fn(),
      ensure: vi.fn(),
    });
    expect(result).toEqual({ ok: true, targetSpeed: 4 });
    expect(apply).toHaveBeenCalledWith(4, tabBehavior(4));
  });

  it('uses sender.tab.url rather than a frame URL', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:9': tabBehavior(1) });
    const persist = vi.fn();
    await adjustTabSpeed(
      {
        tab: { id: 9, url: 'https://www.youtube.com/watch' } as chrome.tabs.Tab,
        url: 'https://youtube.com/embed/1',
        frameId: 3,
      },
      1,
      {
        tabStore,
        persist,
        apply: vi.fn(),
        ensure: vi.fn(),
      },
    );
    expect(persist).toHaveBeenCalledWith('https://www.youtube.com/watch', 1.25);
  });

  it('resolves a fresh target when tab state is missing', async () => {
    const tabStore = memoryTabStore();
    const apply = vi.fn();
    const result = await adjustTabSpeed(sender({ id: 2, url: 'https://example.com/watch' }), -1, {
      tabStore,
      apply,
      persist: vi.fn(),
      ensure: vi.fn(),
      readBehavior: async () => tabBehavior(1.25),
    });
    expect(result).toEqual({ ok: true, targetSpeed: 1 });
    expect(apply).toHaveBeenCalledWith(2, tabBehavior(1));
  });

  it('resolves the top-level tab URL when sender.tab.url is omitted', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:4': tabBehavior(1) });
    const persist = vi.fn();
    const result = await adjustTabSpeed(sender({ id: 4 }), 1, {
      tabStore,
      persist,
      apply: vi.fn(),
      ensure: vi.fn(),
      readTab: async () => ({ url: 'https://play.hbomax.com/watch' }),
    });
    expect(result).toEqual({ ok: true, targetSpeed: 1.25 });
    expect(persist).toHaveBeenCalledWith('https://play.hbomax.com/watch', 1.25);
  });

  it('returns a structured failure for a missing or unsupported tab', async () => {
    await expect(adjustTabSpeed({}, 1)).resolves.toEqual({
      ok: false,
      error: 'Unsupported tab',
    });
    await expect(adjustTabSpeed(sender({ id: 1, url: 'chrome://settings' }), 1)).resolves.toEqual({
      ok: false,
      error: 'Unsupported tab',
    });
  });
});
