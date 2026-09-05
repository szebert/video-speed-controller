// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { readOverlaySeed } from '../background/applied-behavior';
import {
  builtInAppliedTabBehavior,
  isAppliedTabBehavior,
  nonTargetBehaviorFrom,
  toAppliedTabBehavior,
} from '../core/applied-tab-behavior';
import {
  BUILT_IN_SITE_BEHAVIOR,
  OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
  OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
} from '../settings/site-behavior';
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
  it('uses a 2s built-in auto-hide default', () => {
    expect(BUILT_IN_SITE_BEHAVIOR.speedMin).toBe(0.25);
    expect(BUILT_IN_SITE_BEHAVIOR.speedMax).toBe(4);
    expect(BUILT_IN_SITE_BEHAVIOR.speedTick).toBe(0.25);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayVisible).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayPositionButton).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.overlaySettingsButton).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayAutoHide).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayHoverHold).toBe(false);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayAutoHideDelayMs).toBe(2000);
  });

  it('clamps applied auto-hide delay to 100ms–5min', () => {
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, overlayAutoHideDelayMs: 0 })
        .overlayAutoHideDelayMs,
    ).toBe(OVERLAY_AUTO_HIDE_DELAY_MS_MIN);
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, overlayAutoHideDelayMs: 999_999 })
        .overlayAutoHideDelayMs,
    ).toBe(OVERLAY_AUTO_HIDE_DELAY_MS_MAX);
  });

  it('rejects incomplete or invalid runtime records', () => {
    expect(isAppliedTabBehavior(tabBehavior(1.25))).toBe(true);
    expect(isAppliedTabBehavior({ targetSpeed: 1.25 })).toBe(false);
    expect(isAppliedTabBehavior({ ...tabBehavior(1.25), extra: true })).toBe(false);
    expect(isAppliedTabBehavior({ ...tabBehavior(1.25), targetSpeed: Number.NaN })).toBe(false);
    expect(isAppliedTabBehavior({ ...tabBehavior(1.25), overlayPosition: 9 })).toBe(false);
    expect(isAppliedTabBehavior({ ...tabBehavior(1.25), overlayVisible: 1 })).toBe(false);
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
    ).resolves.toEqual(nonTargetBehaviorFrom(builtInAppliedTabBehavior()));
  });
});
