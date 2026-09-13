// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetSiteSpeedPersistCoalescerForTests,
  SITE_SPEED_PERSIST_COALESCE_MS,
} from '../background/coalesce-site-speed';
import { setSpeed } from '../background/set-speed';
import { OVERLAY_POSITION } from '../settings/site-behavior';
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

describe('setSpeed', () => {
  afterEach(() => {
    resetSiteSpeedPersistCoalescerForTests();
    vi.useRealTimers();
  });

  it('preserves existing overlay fields', async () => {
    const tabStore = memoryTabStore();
    const previous = tabBehavior(2, {
      overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT,
      overlayAutoHide: true,
      overlayAutoHideDelayMs: 750,
    });
    await tabStore.set({ 'tab:7': previous });
    const apply = vi.fn();
    await setSpeed(7, 'https://example.com/watch', 2.25, {
      tabStore,
      persist: vi.fn(async () => {}),
      apply,
      ensure: vi.fn(),
    });
    const next = tabBehavior(2.25, {
      overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT,
      overlayAutoHide: true,
      overlayAutoHideDelayMs: 750,
    });
    expect(tabStore.data['tab:7']).toEqual(next);
    expect(apply).toHaveBeenCalledWith(7, next);
  });

  it('rolls back the complete previous tab state when required top-frame injection fails', async () => {
    const tabStore = memoryTabStore();
    const previous = tabBehavior(2);
    await tabStore.set({ 'tab:7': previous });
    const persist = vi.fn();
    const result = await setSpeed(7, 'https://example.com/watch', 2.25, {
      tabStore,
      persist,
      apply: vi.fn(),
      ensure: vi.fn(async () => {
        throw new Error('top-frame injection failed');
      }),
    });

    expect(result).toEqual({ ok: false, error: 'top-frame injection failed' });
    expect(tabStore.data['tab:7']).toEqual(previous);
    expect(persist).not.toHaveBeenCalled();
  });

  it('clears a fresh tabTarget when required top-frame injection fails', async () => {
    const tabStore = memoryTabStore();
    const persist = vi.fn();
    const result = await setSpeed(3, 'https://example.com/watch', 1.25, {
      tabStore,
      persist,
      apply: vi.fn(),
      ensure: vi.fn(async () => {
        throw new Error('top-frame injection failed');
      }),
      readOverlay: async () => tabBehavior(1),
    });

    expect(result.ok).toBe(false);
    expect(tabStore.data['tab:3']).toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
  });

  it('restores the previous tab target when apply throws', async () => {
    const tabStore = memoryTabStore();
    const previous = tabBehavior(2);
    await tabStore.set({ 'tab:7': previous });
    const persist = vi.fn();
    const result = await setSpeed(7, 'https://example.com/watch', 2.25, {
      tabStore,
      persist,
      apply: async () => {
        throw new Error('send failed');
      },
      ensure: vi.fn(),
    });

    expect(result).toEqual({ ok: false, error: 'send failed' });
    expect(tabStore.data['tab:7']).toEqual(previous);
    expect(persist).not.toHaveBeenCalled();
  });

  it('applies tabTarget even when persist throws', async () => {
    const tabStore = memoryTabStore();
    const apply = vi.fn();
    const result = await setSpeed(1, 'https://example.com/watch', 1.5, {
      tabStore,
      apply,
      ensure: vi.fn(),
      readOverlay: async () => tabBehavior(1),
      persist: vi.fn(async () => {
        throw new Error('quota');
      }),
    });

    expect(result).toEqual({
      ok: true,
      targetSpeed: 1.5,
      persistError: 'quota',
    });
    expect(tabStore.data['tab:1']).toEqual(tabBehavior(1.5));
    expect(apply).toHaveBeenCalledWith(1, tabBehavior(1.5));
  });

  it('skips persist when persist is false', async () => {
    const tabStore = memoryTabStore();
    const apply = vi.fn();
    const result = await setSpeed(4, 'https://example.com/watch', 1, {
      tabStore,
      persist: false,
      apply,
      ensure: vi.fn(),
      readOverlay: async () => tabBehavior(1.75),
    });
    expect(result).toEqual({ ok: true, targetSpeed: 1 });
    expect(apply).toHaveBeenCalledWith(4, tabBehavior(1));
  });

  it('treats old speed-only session state as absent', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:1': { targetSpeed: 2 } });
    const apply = vi.fn();
    await setSpeed(1, 'https://example.com/watch', 1.5, {
      tabStore,
      persist: vi.fn(async () => {}),
      apply,
      ensure: vi.fn(),
      readOverlay: async () => tabBehavior(1, { overlayAutoHide: true }),
    });
    expect(tabStore.data['tab:1']).toEqual(tabBehavior(1.5, { overlayAutoHide: true }));
  });

  it('applies each speed immediately and coalesces durable persist', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const persist = vi.fn(async () => {});
    resetSiteSpeedPersistCoalescerForTests({ persist });
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:1': tabBehavior(1) });
    const apply = vi.fn();
    await expect(
      setSpeed(1, 'https://example.com/watch', 1.25, {
        tabStore,
        apply,
        ensure: vi.fn(),
      }),
    ).resolves.toEqual({ ok: true, targetSpeed: 1.25 });
    expect(persist).toHaveBeenCalledTimes(1);
    await expect(
      setSpeed(1, 'https://example.com/watch', 1.5, {
        tabStore,
        apply,
        ensure: vi.fn(),
      }),
    ).resolves.toEqual({ ok: true, targetSpeed: 1.5 });
    expect(tabStore.data['tab:1']).toEqual(tabBehavior(1.5));
    expect(apply).toHaveBeenLastCalledWith(1, tabBehavior(1.5));
    expect(persist).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SITE_SPEED_PERSIST_COALESCE_MS);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith('https://example.com/watch', 1.5);
  });
});
