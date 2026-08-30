// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { readOverlaySeed } from '../background/applied-behavior';
import {
  builtInAppliedTabBehavior,
  isAppliedTabBehavior,
  overlayFieldsFrom,
} from '../core/applied-tab-behavior';
import { getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
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

describe('applied tab behavior', () => {
  it('rejects incomplete or invalid runtime records', () => {
    expect(isAppliedTabBehavior(tabBehavior(1.25))).toBe(true);
    expect(isAppliedTabBehavior({ targetSpeed: 1.25 })).toBe(false);
    expect(isAppliedTabBehavior({ ...tabBehavior(1.25), extra: true })).toBe(false);
    expect(isAppliedTabBehavior({ ...tabBehavior(1.25), targetSpeed: Number.NaN })).toBe(false);
    expect(isAppliedTabBehavior({ ...tabBehavior(1.25), overlayPosition: 9 })).toBe(false);
  });

  it('treats old speed-only session state as absent and round-trips full behavior', async () => {
    const store = memoryTabStore();
    await store.set({ 'tab:4': { targetSpeed: 2 } });
    await expect(getTabState(4, store)).resolves.toBeNull();
    const next = tabBehavior(1.5);
    await setTabState(4, next, store);
    await expect(getTabState(4, store)).resolves.toEqual(next);
  });

  it('falls back to built-in overlay fields when the behavior read fails', async () => {
    await expect(
      readOverlaySeed('https://example.com/watch', async () => {
        throw new Error('offline');
      }),
    ).resolves.toEqual(overlayFieldsFrom(builtInAppliedTabBehavior()));
  });
});
