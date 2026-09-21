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
  SPEED_MAX_SETTING_MIN,
  SPEED_MIN_SETTING_MIN,
  SPEED_STEP_SETTING_MAX,
  SPEED_STEP_SETTING_MIN,
} from '../core/speed';
import {
  BUILT_IN_SITE_BEHAVIOR,
  FLASH_DELAY_MS_MAX,
  FLASH_DELAY_MS_MIN,
  FLASH_OPACITY_MAX,
  FLASH_OPACITY_MIN,
  FLASH_SCALE_MAX,
  FLASH_SCALE_MIN,
  HOTKEY_REPEAT_DELAY_MS_MAX,
  HOTKEY_REPEAT_DELAY_MS_MIN,
  HOTKEY_REPEAT_RATE_MAX,
  HOTKEY_REPEAT_RATE_MIN,
  OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
  OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
  OVERLAY_OPACITY_MAX,
  OVERLAY_OPACITY_MIN,
  OVERLAY_SCALE_MAX,
  OVERLAY_SCALE_MIN,
  SKIP_SECONDS_MAX,
  SKIP_SECONDS_MIN,
  TRANSPORT_RATE_MAGNITUDE_MAX,
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
  it('includes defaultSpeed and rememberLastSpeed from the field registry', () => {
    expect(tabBehavior(1.25)).toEqual(
      expect.objectContaining({
        defaultSpeed: 1,
        rememberLastSpeed: true,
      }),
    );
  });

  it('uses a 2s built-in auto-hide default', () => {
    expect(BUILT_IN_SITE_BEHAVIOR.speedMin).toBe(0.25);
    expect(BUILT_IN_SITE_BEHAVIOR.speedMax).toBe(4);
    expect(BUILT_IN_SITE_BEHAVIOR.decreaseSpeedStep).toBe(0.25);
    expect(BUILT_IN_SITE_BEHAVIOR.increaseSpeedStep).toBe(0.25);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayVisible).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayPositionButton).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.overlaySettingsButton).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayHotkeyHints).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayAutoHide).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayHoverHold).toBe(false);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayAutoHideDelayMs).toBe(2000);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayOpacity).toBe(70);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayScale).toBe(100);
    expect(BUILT_IN_SITE_BEHAVIOR.buttonFlash).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.hotkeyFlash).toBe(true);
    expect(BUILT_IN_SITE_BEHAVIOR.flashDelayMs).toBe(750);
    expect(BUILT_IN_SITE_BEHAVIOR.flashOpacity).toBe(70);
    expect(BUILT_IN_SITE_BEHAVIOR.flashScale).toBe(100);
    expect(BUILT_IN_SITE_BEHAVIOR.hotkeyRepeat).toBe(false);
    expect(BUILT_IN_SITE_BEHAVIOR.hotkeyRepeatDelayMs).toBe(500);
    expect(BUILT_IN_SITE_BEHAVIOR.hotkeyRepeatRate).toBe(15);
    expect(BUILT_IN_SITE_BEHAVIOR.overlayNavigationBar).toBe(false);
    expect(BUILT_IN_SITE_BEHAVIOR.overlaySeekBar).toBe(false);
    expect(BUILT_IN_SITE_BEHAVIOR.skipBackSeconds).toBe(5);
    expect(BUILT_IN_SITE_BEHAVIOR.skipForwardSeconds).toBe(10);
    expect(BUILT_IN_SITE_BEHAVIOR.skipScaleWithPlaybackRate).toBe(false);
    expect(BUILT_IN_SITE_BEHAVIOR.rewindSpeed).toBe(-1);
    expect(BUILT_IN_SITE_BEHAVIOR.fastForwardSpeed).toBe(3);
  });

  it('clamps applied speedMax below 1× and keeps a stored 1× maximum', () => {
    expect(toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, speedMax: 0.5 }).speedMax).toBe(
      SPEED_MAX_SETTING_MIN,
    );
    expect(toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, speedMax: 1 }).speedMax).toBe(1);
    expect(toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, speedMin: 0.01 }).speedMin).toBe(
      SPEED_MIN_SETTING_MIN,
    );
  });

  it('clamps applied speed steps to the product range independently', () => {
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, decreaseSpeedStep: 0 }).decreaseSpeedStep,
    ).toBe(SPEED_STEP_SETTING_MIN);
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, increaseSpeedStep: 2 }).increaseSpeedStep,
    ).toBe(SPEED_STEP_SETTING_MAX);
    const mixed = toAppliedTabBehavior({
      ...BUILT_IN_SITE_BEHAVIOR,
      decreaseSpeedStep: 0.1,
      increaseSpeedStep: 0.5,
    });
    expect(mixed.decreaseSpeedStep).toBe(0.1);
    expect(mixed.increaseSpeedStep).toBe(0.5);
  });

  it('clamps applied skip distances and keeps transport rates signed', () => {
    const applied = (overrides: Partial<typeof BUILT_IN_SITE_BEHAVIOR>) =>
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, ...overrides });
    expect(applied({ skipBackSeconds: 0 }).skipBackSeconds).toBe(SKIP_SECONDS_MIN);
    expect(applied({ skipForwardSeconds: 99_999 }).skipForwardSeconds).toBe(SKIP_SECONDS_MAX);
    expect(applied({ rewindSpeed: 2 }).rewindSpeed).toBe(-2);
    expect(applied({ rewindSpeed: -99 }).rewindSpeed).toBe(-TRANSPORT_RATE_MAGNITUDE_MAX);
    expect(applied({ fastForwardSpeed: -5 }).fastForwardSpeed).toBe(5);
    expect(applied({ fastForwardSpeed: 99 }).fastForwardSpeed).toBe(TRANSPORT_RATE_MAGNITUDE_MAX);
  });

  it('rejects a session record missing or mistyping a navigation field', () => {
    const missing: Record<string, unknown> = { ...tabBehavior(1.25) };
    delete missing.skipForwardSeconds;
    expect(isAppliedTabBehavior(missing)).toBe(false);
    expect(isAppliedTabBehavior({ ...tabBehavior(1.25), overlayNavigationBar: 1 })).toBe(false);
    expect(isAppliedTabBehavior({ ...tabBehavior(1.25), overlaySeekBar: 1 })).toBe(false);
    expect(isAppliedTabBehavior({ ...tabBehavior(1.25), rewindSpeed: '-1' })).toBe(false);
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

  it('clamps applied hotkey flash delay to 100ms–5s', () => {
    expect(toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, flashDelayMs: 0 }).flashDelayMs).toBe(
      FLASH_DELAY_MS_MIN,
    );
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, flashDelayMs: 99_000 }).flashDelayMs,
    ).toBe(FLASH_DELAY_MS_MAX);
  });

  it('clamps applied overlay opacity to 1–100', () => {
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, overlayOpacity: 0 }).overlayOpacity,
    ).toBe(OVERLAY_OPACITY_MIN);
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, overlayOpacity: 150 }).overlayOpacity,
    ).toBe(OVERLAY_OPACITY_MAX);
  });

  it('clamps applied overlay scale to 25–300', () => {
    expect(toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, overlayScale: 0 }).overlayScale).toBe(
      OVERLAY_SCALE_MIN,
    );
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, overlayScale: 400 }).overlayScale,
    ).toBe(OVERLAY_SCALE_MAX);
  });

  it('clamps applied hotkey repeat delay and snaps applied rate', () => {
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, hotkeyRepeatDelayMs: 0 })
        .hotkeyRepeatDelayMs,
    ).toBe(HOTKEY_REPEAT_DELAY_MS_MIN);
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, hotkeyRepeatDelayMs: 99_000 })
        .hotkeyRepeatDelayMs,
    ).toBe(HOTKEY_REPEAT_DELAY_MS_MAX);
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, hotkeyRepeatRate: 14.73 }).hotkeyRepeatRate,
    ).toBe(14.5);
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, hotkeyRepeatRate: 0 }).hotkeyRepeatRate,
    ).toBe(HOTKEY_REPEAT_RATE_MIN);
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, hotkeyRepeatRate: 99 }).hotkeyRepeatRate,
    ).toBe(HOTKEY_REPEAT_RATE_MAX);
  });

  it('clamps applied flash scale to 25–300', () => {
    expect(toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, flashScale: 0 }).flashScale).toBe(
      FLASH_SCALE_MIN,
    );
    expect(toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, flashScale: 400 }).flashScale).toBe(
      FLASH_SCALE_MAX,
    );
  });

  it('clamps applied hotkey flash opacity to 1–100', () => {
    expect(toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, flashOpacity: 0 }).flashOpacity).toBe(
      FLASH_OPACITY_MIN,
    );
    expect(
      toAppliedTabBehavior({ ...BUILT_IN_SITE_BEHAVIOR, flashOpacity: 150 }).flashOpacity,
    ).toBe(FLASH_OPACITY_MAX);
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
