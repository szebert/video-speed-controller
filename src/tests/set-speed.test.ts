// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
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
      persist: vi.fn(),
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

  it('treats old speed-only session state as absent', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:1': { targetSpeed: 2 } });
    const apply = vi.fn();
    await setSpeed(1, 'https://example.com/watch', 1.5, {
      tabStore,
      persist: vi.fn(),
      apply,
      ensure: vi.fn(),
      readOverlay: async () => tabBehavior(1, { overlayAutoHide: true }),
    });
    expect(tabStore.data['tab:1']).toEqual(tabBehavior(1.5, { overlayAutoHide: true }));
  });
});
