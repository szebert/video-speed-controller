// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPEED_POLICY,
  SPEED_MAX_SETTING_MAX,
  SPEED_MAX_SETTING_MIN,
  SPEED_MIN_SETTING_MIN,
  SPEED_TICK_SETTING_MAX,
  SPEED_TICK_SETTING_MIN,
} from '../core/speed';
import { emptyEffectiveHotkeys, matchHotkeyAction } from '../settings/hotkey-binding';
import {
  applyBehaviorSettingChange,
  canonicalizeBehaviorSettingChange,
  EDITABLE_BEHAVIOR_FIELDS,
  hasValueOverrides,
  inheritAllKnownSettings,
  tombstoneExistingSiteSettings,
  mergeOverrideField,
  FLASH_DELAY_MS_MAX,
  FLASH_DELAY_MS_MIN,
  FLASH_OPACITY_MAX,
  FLASH_OPACITY_MIN,
  HOTKEY_REPEAT_DELAY_MS_MAX,
  HOTKEY_REPEAT_DELAY_MS_MIN,
  HOTKEY_REPEAT_RATE_MAX,
  HOTKEY_REPEAT_RATE_MIN,
  HOLD_ACTIONS,
  hotkeyActionMode,
  OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
  OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
  OVERLAY_OPACITY_MAX,
  OVERLAY_OPACITY_MIN,
  overlayPositionFromGrid,
  overlayPositionToGrid,
  hotkeyChangesWouldConflict,
  prospectiveEffectiveHotkeys,
  resolveSiteBehavior,
  revalidateResolvedSpeed,
  toEffectiveBehavior,
  toEffectiveHotkeys,
  toSyncEligibleSiteRecord,
  isOverride,
  isOverlayPosition,
  OVERLAY_POSITION,
  SITE_HOTKEY_ACTIONS,
  SITE_INHERIT_SYNC_RETENTION_MS,
  withSpeedInherit,
  withSpeedValue,
  type Override,
} from '../settings/site-behavior';
import {
  parseBehaviorOverrides,
  parseGlobalBehaviorSettings,
  parseReadySiteSettings,
  parseSiteSettings,
} from '../settings/behavior-schema';

describe('site behavior resolution', () => {
  it('uses built-in defaults when no overrides exist', () => {
    const resolved = resolveSiteBehavior({}, {});
    expect(resolved.speed).toEqual({ value: 1, source: 'built-in' });
    expect(resolved.overlayPosition).toEqual({
      value: OVERLAY_POSITION.TOP_CENTER,
      source: 'built-in',
    });
    expect(resolved.speedMin).toEqual({ value: 0.25, source: 'built-in' });
    expect(resolved.speedMax).toEqual({ value: 4, source: 'built-in' });
    expect(resolved.speedTick).toEqual({ value: 0.25, source: 'built-in' });
    expect(resolved.overlayVisible).toEqual({ value: true, source: 'built-in' });
    expect(resolved.overlayPositionButton).toEqual({ value: true, source: 'built-in' });
    expect(resolved.overlaySettingsButton).toEqual({ value: true, source: 'built-in' });
    expect(resolved.overlayHotkeyHints).toEqual({ value: true, source: 'built-in' });
    expect(resolved.overlayAutoHide).toEqual({ value: true, source: 'built-in' });
    expect(resolved.overlayHoverHold).toEqual({ value: false, source: 'built-in' });
    expect(resolved.overlayAutoHideDelayMs).toEqual({ value: 2000, source: 'built-in' });
    expect(resolved.overlayOpacity).toEqual({ value: 70, source: 'built-in' });
    expect(resolved.buttonFlash).toEqual({ value: false, source: 'built-in' });
    expect(resolved.hotkeyFlash).toEqual({ value: true, source: 'built-in' });
    expect(resolved.flashDelayMs).toEqual({ value: 750, source: 'built-in' });
    expect(resolved.flashOpacity).toEqual({ value: 70, source: 'built-in' });
    expect(resolved.hotkeyRepeat).toEqual({ value: false, source: 'built-in' });
    expect(resolved.hotkeyRepeatDelayMs).toEqual({ value: 500, source: 'built-in' });
    expect(resolved.hotkeyRepeatRate).toEqual({ value: 15, source: 'built-in' });
    expect(toEffectiveBehavior(resolved).speed).toBe(resolved.speed.value);
    expect(resolved.hotkeys).toEqual({
      ...Object.fromEntries(
        SITE_HOTKEY_ACTIONS.map((action) => [action, { value: null, source: 'built-in' }]),
      ),
      decreaseSpeed: {
        value: { code: 'BracketLeft', ctrl: false, alt: false, shift: false, meta: false },
        source: 'built-in',
      },
      increaseSpeed: {
        value: { code: 'BracketRight', ctrl: false, alt: false, shift: false, meta: false },
        source: 'built-in',
      },
      resetSpeed: {
        value: { code: 'Backslash', ctrl: false, alt: false, shift: false, meta: false },
        source: 'built-in',
      },
    });
    expect(toEffectiveBehavior(resolved).hotkeys.resetSpeed).toEqual({
      code: 'Backslash',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    });
  });

  it('resolves site unbind, inherit, and global value as a total map', () => {
    const binding = {
      code: 'KeyD',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    const resolved = resolveSiteBehavior(
      {
        hotkeys: {
          increaseSpeed: { kind: 'value', value: binding, updatedAt: 1 },
          resetSpeed: { kind: 'value', value: null, updatedAt: 1 },
        },
      },
      {
        hotkeys: {
          increaseSpeed: { kind: 'inherit', updatedAt: 2 },
          decreaseSpeed: { kind: 'value', value: null, updatedAt: 2 },
        },
      },
    );
    expect(resolved.hotkeys.increaseSpeed).toEqual({ value: binding, source: 'global' });
    expect(resolved.hotkeys.decreaseSpeed).toEqual({ value: null, source: 'site' });
    expect(resolved.hotkeys.resetSpeed).toEqual({ value: null, source: 'global' });
    expect(
      hasValueOverrides({ hotkeys: { resetSpeed: { kind: 'value', value: null, updatedAt: 1 } } }),
    ).toBe(true);
    expect(hasValueOverrides({ hotkeys: { resetSpeed: { kind: 'inherit', updatedAt: 1 } } })).toBe(
      false,
    );
  });

  it('previews inherit and value changes on the effective hotkey map', () => {
    const current = toEffectiveHotkeys(resolveSiteBehavior());
    const remapped = prospectiveEffectiveHotkeys(current, current, [
      { kind: 'hotkey-value', action: 'decreaseSpeed', value: current.increaseSpeed },
      { kind: 'hotkey-inherit', action: 'increaseSpeed' },
    ]);
    expect(remapped.decreaseSpeed).toEqual(current.increaseSpeed);
    expect(remapped.increaseSpeed).toEqual(current.increaseSpeed);
    expect(
      hotkeyChangesWouldConflict(
        {},
        {
          hotkeys: {
            decreaseSpeed: { kind: 'value', value: current.increaseSpeed, updatedAt: 1 },
            increaseSpeed: { kind: 'value', value: current.decreaseSpeed, updatedAt: 1 },
          },
        },
        [{ kind: 'hotkey-inherit', action: 'increaseSpeed' }],
      ),
    ).toBe(false);
    expect(
      hotkeyChangesWouldConflict(
        {},
        {
          hotkeys: {
            decreaseSpeed: { kind: 'value', value: current.increaseSpeed, updatedAt: 1 },
          },
        },
        [{ kind: 'hotkey-value', action: 'increaseSpeed', value: current.increaseSpeed }],
      ),
    ).toBe(true);
    expect(
      hotkeyChangesWouldConflict(
        {},
        {},
        [{ kind: 'hotkey-inherit', action: 'increaseSpeed' }],
        'built-in',
      ),
    ).toBe(false);
  });

  it('lets a more specific binding win in the runtime hotkey map', () => {
    const resolved = resolveSiteBehavior(
      {},
      {
        hotkeys: {
          decreaseSpeed: {
            kind: 'value',
            value: {
              code: 'BracketRight',
              ctrl: false,
              alt: false,
              shift: false,
              meta: false,
            },
            updatedAt: 1,
          },
        },
      },
    );
    expect(resolved.hotkeys.decreaseSpeed.source).toBe('site');
    expect(resolved.hotkeys.increaseSpeed.source).toBe('built-in');
    const runtime = toEffectiveHotkeys(resolved);
    expect(runtime).toEqual({
      ...emptyEffectiveHotkeys(),
      decreaseSpeed: {
        code: 'BracketRight',
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      },
      increaseSpeed: null,
      resetSpeed: {
        code: 'Backslash',
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      },
    });
    expect(
      matchHotkeyAction(runtime, new KeyboardEvent('keydown', { code: 'BracketRight', key: ']' })),
    ).toBe('decreaseSpeed');
    const tied = resolveSiteBehavior(
      {},
      {
        hotkeys: {
          decreaseSpeed: {
            kind: 'value',
            value: {
              code: 'KeyA',
              ctrl: false,
              alt: false,
              shift: false,
              meta: false,
            },
            updatedAt: 1,
          },
          increaseSpeed: {
            kind: 'value',
            value: {
              code: 'KeyA',
              ctrl: false,
              alt: false,
              shift: false,
              meta: false,
            },
            updatedAt: 1,
          },
        },
      },
    );
    expect(toEffectiveHotkeys(tied)).toEqual({
      ...emptyEffectiveHotkeys(),
      decreaseSpeed: null,
      increaseSpeed: null,
      resetSpeed: {
        code: 'Backslash',
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      },
    });
  });

  it('clamps stored auto-hide delays outside 100ms–5min without dropping the override', () => {
    expect(
      resolveSiteBehavior(
        { overlayAutoHideDelayMs: { kind: 'value', value: 0, updatedAt: 10 } },
        {},
      ).overlayAutoHideDelayMs,
    ).toEqual({
      value: OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
      source: 'global',
    });
    expect(
      resolveSiteBehavior(
        { overlayAutoHideDelayMs: { kind: 'value', value: 999_999, updatedAt: 10 } },
        {},
      ).overlayAutoHideDelayMs,
    ).toEqual({
      value: OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
      source: 'global',
    });
  });

  it('clamps stored hotkey flash delays outside 100ms–5s without dropping the override', () => {
    expect(
      resolveSiteBehavior({ flashDelayMs: { kind: 'value', value: 0, updatedAt: 10 } }, {})
        .flashDelayMs,
    ).toEqual({
      value: FLASH_DELAY_MS_MIN,
      source: 'global',
    });
    expect(
      resolveSiteBehavior({ flashDelayMs: { kind: 'value', value: 99_000, updatedAt: 10 } }, {})
        .flashDelayMs,
    ).toEqual({
      value: FLASH_DELAY_MS_MAX,
      source: 'global',
    });
  });

  it('clamps stored hotkey repeat delay and snaps stored rate without dropping the override', () => {
    expect(
      resolveSiteBehavior({ hotkeyRepeatDelayMs: { kind: 'value', value: 0, updatedAt: 10 } }, {})
        .hotkeyRepeatDelayMs,
    ).toEqual({
      value: HOTKEY_REPEAT_DELAY_MS_MIN,
      source: 'global',
    });
    expect(
      resolveSiteBehavior(
        { hotkeyRepeatDelayMs: { kind: 'value', value: 99_000, updatedAt: 10 } },
        {},
      ).hotkeyRepeatDelayMs,
    ).toEqual({
      value: HOTKEY_REPEAT_DELAY_MS_MAX,
      source: 'global',
    });
    expect(
      resolveSiteBehavior({ hotkeyRepeatRate: { kind: 'value', value: 14.73, updatedAt: 10 } }, {})
        .hotkeyRepeatRate,
    ).toEqual({
      value: 14.5,
      source: 'global',
    });
    expect(
      resolveSiteBehavior({ hotkeyRepeatRate: { kind: 'value', value: 0, updatedAt: 10 } }, {})
        .hotkeyRepeatRate,
    ).toEqual({
      value: HOTKEY_REPEAT_RATE_MIN,
      source: 'global',
    });
    expect(
      resolveSiteBehavior({ hotkeyRepeatRate: { kind: 'value', value: 99, updatedAt: 10 } }, {})
        .hotkeyRepeatRate,
    ).toEqual({
      value: HOTKEY_REPEAT_RATE_MAX,
      source: 'global',
    });
  });

  it('repeats speed and skip actions only when enabled; Reset never repeats', () => {
    for (const action of ['increaseSpeed', 'decreaseSpeed', 'skipBack', 'skipForward'] as const) {
      expect(hotkeyActionMode(action, false)).toBe('once');
      expect(hotkeyActionMode(action, true)).toBe('repeat');
    }
    for (const action of ['resetSpeed', 'jumpToStart', 'jumpToEnd', 'playPause'] as const) {
      expect(hotkeyActionMode(action, false)).toBe('once');
      expect(hotkeyActionMode(action, true)).toBe('once');
    }
  });

  it('defaults navigation to 5s back, 10s forward, −1× rewind, and 3× fast forward', () => {
    const resolved = resolveSiteBehavior();
    expect(resolved.overlayNavigationBar).toEqual({ value: false, source: 'built-in' });
    expect(resolved.skipBackSeconds).toEqual({ value: 5, source: 'built-in' });
    expect(resolved.skipForwardSeconds).toEqual({ value: 10, source: 'built-in' });
    expect(resolved.skipScaleWithPlaybackRate).toEqual({ value: false, source: 'built-in' });
    expect(resolved.rewindSpeed).toEqual({ value: -1, source: 'built-in' });
    expect(resolved.fastForwardSpeed).toEqual({ value: 3, source: 'built-in' });
  });

  it('keeps rewind negative and fast forward positive within Chromium bounds', () => {
    const canonicalize = (field: 'rewindSpeed' | 'fastForwardSpeed', value: number) =>
      canonicalizeBehaviorSettingChange({ kind: 'value', field, value });

    expect(canonicalize('rewindSpeed', 2)).toEqual({
      kind: 'value',
      field: 'rewindSpeed',
      value: -2,
    });
    expect(canonicalize('rewindSpeed', -99)).toEqual({
      kind: 'value',
      field: 'rewindSpeed',
      value: -SPEED_MAX_SETTING_MAX,
    });
    expect(canonicalize('rewindSpeed', -0.01)).toEqual({
      kind: 'value',
      field: 'rewindSpeed',
      value: -SPEED_MIN_SETTING_MIN,
    });
    expect(canonicalize('fastForwardSpeed', -3)).toEqual({
      kind: 'value',
      field: 'fastForwardSpeed',
      value: 3,
    });
    expect(canonicalize('fastForwardSpeed', 99)).toEqual({
      kind: 'value',
      field: 'fastForwardSpeed',
      value: SPEED_MAX_SETTING_MAX,
    });
    expect(canonicalize('rewindSpeed', 0)).toBeNull();
    expect(canonicalize('fastForwardSpeed', 0)).toBeNull();
    expect(canonicalize('fastForwardSpeed', Number.NaN)).toBeNull();
  });

  it('accepts fractional skip seconds and clamps stored values on resolve', () => {
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'skipBackSeconds', value: 2.5 }),
    ).toEqual({ kind: 'value', field: 'skipBackSeconds', value: 2.5 });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'skipForwardSeconds', value: 0 }),
    ).toBeNull();
    expect(
      resolveSiteBehavior({ skipBackSeconds: { kind: 'value', value: 99_999, updatedAt: 1 } }, {}),
    ).toMatchObject({ skipBackSeconds: { value: 3600, source: 'global' } });
    expect(
      resolveSiteBehavior({ rewindSpeed: { kind: 'value', value: 4, updatedAt: 1 } }, {}),
    ).toMatchObject({ rewindSpeed: { value: -4, source: 'global' } });
  });

  it('inherits navigation values from global to site', () => {
    const resolved = resolveSiteBehavior(
      { skipForwardSeconds: { kind: 'value', value: 30, updatedAt: 1 } },
      { fastForwardSpeed: { kind: 'value', value: 8, updatedAt: 2 } },
    );
    expect(resolved.skipForwardSeconds).toEqual({ value: 30, source: 'global' });
    expect(resolved.fastForwardSpeed).toEqual({ value: 8, source: 'site' });
    expect(resolved.skipBackSeconds).toEqual({ value: 5, source: 'built-in' });
  });

  it('holds fast forward regardless of repeat, and keeps rewind disabled', () => {
    expect(hotkeyActionMode('fastForward', false)).toBe('hold');
    expect(hotkeyActionMode('fastForward', true)).toBe('hold');
    expect(HOLD_ACTIONS.has('rewind')).toBe(true);
    expect(hotkeyActionMode('rewind', false)).toBe('disabled');
    expect(hotkeyActionMode('rewind', true)).toBe('disabled');
  });

  it('clamps stored hotkey flash opacity outside 1–100 without dropping the override', () => {
    expect(
      resolveSiteBehavior({ flashOpacity: { kind: 'value', value: 0, updatedAt: 10 } }, {})
        .flashOpacity,
    ).toEqual({
      value: FLASH_OPACITY_MIN,
      source: 'global',
    });
    expect(
      resolveSiteBehavior({ flashOpacity: { kind: 'value', value: 150, updatedAt: 10 } }, {})
        .flashOpacity,
    ).toEqual({
      value: FLASH_OPACITY_MAX,
      source: 'global',
    });
  });

  it('clamps stored overlay opacity outside 1–100 without dropping the override', () => {
    expect(
      resolveSiteBehavior({ overlayOpacity: { kind: 'value', value: 0, updatedAt: 10 } }, {})
        .overlayOpacity,
    ).toEqual({
      value: OVERLAY_OPACITY_MIN,
      source: 'global',
    });
    expect(
      resolveSiteBehavior({ overlayOpacity: { kind: 'value', value: 150, updatedAt: 10 } }, {})
        .overlayOpacity,
    ).toEqual({
      value: OVERLAY_OPACITY_MAX,
      source: 'global',
    });
  });

  it('lets a global value override the built-in', () => {
    const resolved = resolveSiteBehavior(
      { speed: { kind: 'value', value: 1.25, updatedAt: 10 } },
      {},
    );
    expect(resolved.speed).toEqual({ value: 1.25, source: 'global' });
  });

  it('lets a site value override the global', () => {
    const resolved = resolveSiteBehavior(
      { speed: { kind: 'value', value: 1.25, updatedAt: 10 } },
      { speed: { kind: 'value', value: 1.5, updatedAt: 20 } },
    );
    expect(resolved.speed).toEqual({ value: 1.5, source: 'site' });
  });

  it('follows the current global value after a site inherit', () => {
    const resolved = resolveSiteBehavior(
      { speed: { kind: 'value', value: 1.25, updatedAt: 10 } },
      { speed: { kind: 'inherit', updatedAt: 20 } },
    );
    expect(resolved.speed).toEqual({ value: 1.25, source: 'global' });
  });

  it('follows the built-in after a global inherit', () => {
    const resolved = resolveSiteBehavior({ speed: { kind: 'inherit', updatedAt: 10 } }, {});
    expect(resolved.speed).toEqual({ value: 1, source: 'built-in' });
  });

  it('does not freeze unrelated global fields when one site field is set', () => {
    const resolved = resolveSiteBehavior(
      {
        speed: { kind: 'value', value: 1.25, updatedAt: 10 },
        overlayPosition: { kind: 'value', value: OVERLAY_POSITION.BOTTOM_RIGHT, updatedAt: 10 },
      },
      { speed: { kind: 'value', value: 1.75, updatedAt: 20 } },
    );
    expect(resolved.speed.source).toBe('site');
    expect(resolved.overlayPosition).toEqual({
      value: OVERLAY_POSITION.BOTTOM_RIGHT,
      source: 'global',
    });
  });

  it('clamps effective speed without rewriting stored semantic state', () => {
    const stored: Override<number> = { kind: 'value', value: 5, updatedAt: 100 };
    const resolved = resolveSiteBehavior({}, { speed: stored }, DEFAULT_SPEED_POLICY);
    expect(resolved.speed).toEqual({ value: 4, source: 'site' });
    expect(stored).toEqual({ kind: 'value', value: 5, updatedAt: 100 });
  });

  it('clamps effective speed to a resolved max of 16', () => {
    const resolved = resolveSiteBehavior(
      { speedMax: { kind: 'value', value: 16, updatedAt: 1 } },
      { speed: { kind: 'value', value: 10, updatedAt: 2 } },
    );
    expect(resolved.speed).toEqual({ value: 10, source: 'site' });
    expect(resolved.speedMax).toEqual({ value: 16, source: 'global' });
  });

  it('revalidates a resolved speed when min and max collapse to 1×', () => {
    const resolved = resolveSiteBehavior(
      {
        speedMin: { kind: 'value', value: 1, updatedAt: 1 },
        speed: { kind: 'value', value: 2.25, updatedAt: 2 },
      },
      {},
    );
    expect(resolved.speed).toEqual({ value: 2.25, source: 'global' });
    expect(
      revalidateResolvedSpeed({
        ...resolved,
        speedMax: { value: 1, source: 'global' as const },
      }).speed,
    ).toEqual({ value: 1, source: 'global' });
  });

  it('clamps stored speedMax below 1× and keeps a 1/1 fixed-speed policy', () => {
    expect(
      resolveSiteBehavior({ speedMax: { kind: 'value', value: 0.5, updatedAt: 10 } }, {}).speedMax,
    ).toEqual({
      value: SPEED_MAX_SETTING_MIN,
      source: 'global',
    });
    expect(
      resolveSiteBehavior(
        {
          speedMin: { kind: 'value', value: 1, updatedAt: 10 },
          speedMax: { kind: 'value', value: 1, updatedAt: 10 },
        },
        {},
      ),
    ).toMatchObject({
      speedMin: { value: 1, source: 'global' },
      speedMax: { value: 1, source: 'global' },
    });
  });

  it('clamps stored speedTick to the product range without rewriting storage', () => {
    const stored: Override<number> = { kind: 'value', value: 2, updatedAt: 10 };
    expect(resolveSiteBehavior({ speedTick: stored }, {}).speedTick).toEqual({
      value: SPEED_TICK_SETTING_MAX,
      source: 'global',
    });
    expect(
      resolveSiteBehavior({ speedTick: { kind: 'value', value: 0, updatedAt: 10 } }, {}).speedTick,
    ).toEqual({
      value: SPEED_TICK_SETTING_MIN,
      source: 'global',
    });
    expect(stored).toEqual({ kind: 'value', value: 2, updatedAt: 10 });
  });
});

describe('field merge primitive', () => {
  it('keeps independent fields instead of whole-record last-write-wins', () => {
    expect(
      mergeOverrideField(
        { kind: 'value', value: 1.25, updatedAt: 10 },
        { kind: 'value', value: 1.75, updatedAt: 20 },
      ),
    ).toEqual({ kind: 'value', value: 1.75, updatedAt: 20 });
  });

  it('prefers inherit over value at the same timestamp', () => {
    expect(
      mergeOverrideField(
        { kind: 'value', value: 1.5, updatedAt: 10 },
        { kind: 'inherit', updatedAt: 10 },
      ),
    ).toEqual({ kind: 'inherit', updatedAt: 10 });
  });

  it('uses Sync as the equal-time live-value tie-break', () => {
    expect(
      mergeOverrideField(
        { kind: 'value', value: 1.25, updatedAt: 10 },
        { kind: 'value', value: 1.75, updatedAt: 10 },
      ),
    ).toEqual({ kind: 'value', value: 1.25, updatedAt: 10 });
  });

  it('converges identical values to the newer updatedAt', () => {
    expect(
      mergeOverrideField(
        { kind: 'value', value: 1.5, updatedAt: 100 },
        { kind: 'value', value: 1.5, updatedAt: 200 },
      ),
    ).toEqual({ kind: 'value', value: 1.5, updatedAt: 200 });
  });

  it('merges hotkey actions independently and drops malformed persisted bindings', () => {
    const increase = mergeOverrideField<unknown>(
      { kind: 'value', value: null, updatedAt: 5 },
      { kind: 'inherit', updatedAt: 8 },
    );
    expect(increase).toEqual({ kind: 'inherit', updatedAt: 8 });
    expect(
      parseSiteSettings({
        schemaVersion: 1,
        lastUsedAt: 1,
        overrides: {
          hotkeys: { increaseSpeed: { kind: 'value', value: { code: 'KeyD' }, updatedAt: 1 } },
        },
      }),
    ).toBeNull();
  });

  it('parses a complete hotkey binding and keeps unknown actions in extras', () => {
    const binding = {
      code: 'KeyD',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    expect(
      parseSiteSettings({
        schemaVersion: 1,
        lastUsedAt: 1,
        overrides: {
          hotkeys: { increaseSpeed: { kind: 'value', value: binding, updatedAt: 1 } },
        },
      }),
    ).toEqual({
      schemaVersion: 1,
      lastUsedAt: 1,
      overrides: {
        hotkeys: { increaseSpeed: { kind: 'value', value: binding, updatedAt: 1 } },
      },
    });
    const ready = parseReadySiteSettings({
      schemaVersion: 1,
      lastUsedAt: 1,
      overrides: {
        hotkeys: {
          increaseSpeed: { kind: 'value', value: binding, updatedAt: 1 },
          seekForward: { kind: 'value', value: binding, updatedAt: 2 },
        },
      },
    });
    expect(ready?.record.overrides).toEqual({
      hotkeys: { increaseSpeed: { kind: 'value', value: binding, updatedAt: 1 } },
    });
    expect(ready?.extras.overrides).toEqual({
      hotkeys: { seekForward: { kind: 'value', value: binding, updatedAt: 2 } },
    });
  });
});

describe('sync-eligible projection', () => {
  it('omits expired site inherit fields', () => {
    const now = SITE_INHERIT_SYNC_RETENTION_MS + 50;
    const projected = toSyncEligibleSiteRecord(
      {
        schemaVersion: 1,
        lastUsedAt: now,
        overrides: {
          speed: { kind: 'value', value: 1.75, updatedAt: now },
          overlayPosition: { kind: 'inherit', updatedAt: 0 },
        },
      },
      now,
    );
    expect(projected?.overrides.speed).toEqual({ kind: 'value', value: 1.75, updatedAt: now });
    expect(projected?.overrides.overlayPosition).toBeUndefined();
  });

  it('returns null when only expired inherits remain', () => {
    expect(
      toSyncEligibleSiteRecord(
        {
          schemaVersion: 1,
          lastUsedAt: 1,
          overrides: { overlayPosition: { kind: 'inherit', updatedAt: 0 } },
        },
        SITE_INHERIT_SYNC_RETENTION_MS + 1,
      ),
    ).toBeNull();
  });
});

describe('overlay position grid', () => {
  it('uses named constants for the row-major 3x3 grid', () => {
    expect(OVERLAY_POSITION.TOP_LEFT).toBe(0);
    expect(OVERLAY_POSITION.TOP_CENTER).toBe(1);
    expect(OVERLAY_POSITION.CENTER).toBe(4);
    expect(OVERLAY_POSITION.BOTTOM_RIGHT).toBe(8);
    expect(overlayPositionToGrid(0)).toEqual({ row: 0, column: 0 });
    expect(overlayPositionToGrid(1)).toEqual({ row: 0, column: 1 });
    expect(overlayPositionToGrid(4)).toEqual({ row: 1, column: 1 });
    expect(overlayPositionToGrid(8)).toEqual({ row: 2, column: 2 });
    expect(overlayPositionFromGrid(0, 0)).toBe(0);
    expect(overlayPositionFromGrid(1, 1)).toBe(4);
    expect(overlayPositionFromGrid(2, 2)).toBe(8);
  });

  it('rejects a poison updatedAt so it cannot enter the logical clock', () => {
    const isUnknown = (value: unknown): value is unknown => value !== undefined;
    expect(isOverride({ kind: 'inherit', updatedAt: Number.MAX_SAFE_INTEGER }, isUnknown)).toBe(
      false,
    );
    expect(isOverride({ kind: 'inherit', updatedAt: -1 }, isUnknown)).toBe(false);
    expect(isOverride({ kind: 'inherit', updatedAt: 10 }, isUnknown)).toBe(true);
  });

  it('accepts only integer codes 0 through 8', () => {
    expect(isOverlayPosition(0)).toBe(true);
    expect(isOverlayPosition(8)).toBe(true);
    expect(isOverlayPosition(-1)).toBe(false);
    expect(isOverlayPosition(9)).toBe(false);
    expect(isOverlayPosition(1.5)).toBe(false);
    expect(isOverlayPosition('top-center')).toBe(false);
  });
});

describe('forward-compatible V1 parsers', () => {
  it('preserves unknown keys, salvages malformed known fields, and rejects empty site records', () => {
    expect(
      parseSiteSettings({
        schemaVersion: 1,
        lastUsedAt: 1,
        overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 1 } },
        extra: true,
      }),
    ).toEqual({
      schemaVersion: 1,
      lastUsedAt: 1,
      overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 1 } },
    });
    expect(
      parseBehaviorOverrides({
        speed: { kind: 'value', value: 1.5, updatedAt: 1 },
        overlayPositon: { kind: 'inherit', updatedAt: 1 },
      }),
    ).toEqual({ speed: { kind: 'value', value: 1.5, updatedAt: 1 } });
    expect(
      parseBehaviorOverrides({ speed: { kind: 'inherit', updatedAt: 1, value: 1.5 } }),
    ).toEqual({});
    expect(
      parseSiteSettings({
        schemaVersion: 1,
        lastUsedAt: 1,
        overrides: { overlayPosition: { kind: 'value', value: 'top-center', updatedAt: 1 } },
      }),
    ).toBeNull();
    expect(
      parseBehaviorOverrides({
        overlayPosition: { kind: 'value', value: 9, updatedAt: 1 },
      }),
    ).toEqual({});
    expect(parseSiteSettings({ schemaVersion: 1, lastUsedAt: 1, overrides: {} })).toBeNull();
    expect(
      parseSiteSettings({
        schemaVersion: 1,
        lastUsedAt: 1,
        overrides: { hotkeys: {} },
      }),
    ).toBeNull();
    expect(parseGlobalBehaviorSettings({ schemaVersion: 1, overrides: {} })).toEqual({
      schemaVersion: 1,
      overrides: {},
    });
    expect(
      parseBehaviorOverrides({
        overlayOpacity: { kind: 'value', value: 40.5, updatedAt: 1 },
      }),
    ).toEqual({});
    expect(
      parseBehaviorOverrides({
        overlayOpacity: { kind: 'value', value: 40, updatedAt: 1 },
      }),
    ).toEqual({
      overlayOpacity: { kind: 'value', value: 40, updatedAt: 1 },
    });
    expect(
      parseBehaviorOverrides({
        overlayAutoHideDelayMs: { kind: 'value', value: 2000.5, updatedAt: 1 },
      }),
    ).toEqual({});
    expect(
      parseBehaviorOverrides({
        overlayAutoHideDelayMs: { kind: 'value', value: -1, updatedAt: 1 },
      }),
    ).toEqual({});
    expect(
      parseBehaviorOverrides({
        overlayAutoHideDelayMs: { kind: 'value', value: 2500, updatedAt: 1 },
      }),
    ).toEqual({
      overlayAutoHideDelayMs: { kind: 'value', value: 2500, updatedAt: 1 },
    });
    expect(
      parseBehaviorOverrides({
        overlayAutoHideDelayMs: { kind: 'value', value: 0, updatedAt: 1 },
      }),
    ).toEqual({
      overlayAutoHideDelayMs: { kind: 'value', value: 0, updatedAt: 1 },
    });
    expect(
      parseBehaviorOverrides({
        overlayAutoHideDelayMs: { kind: 'value', value: 50, updatedAt: 1 },
      }),
    ).toEqual({
      overlayAutoHideDelayMs: { kind: 'value', value: 50, updatedAt: 1 },
    });
    expect(
      parseBehaviorOverrides({
        overlayAutoHideDelayMs: {
          kind: 'value',
          value: Number.MAX_SAFE_INTEGER + 1,
          updatedAt: 1,
        },
      }),
    ).toEqual({
      overlayAutoHideDelayMs: {
        kind: 'value',
        value: Number.MAX_SAFE_INTEGER + 1,
        updatedAt: 1,
      },
    });
    expect(
      parseBehaviorOverrides({
        overlayPositionButton: { kind: 'value', value: false, updatedAt: 1 },
        overlaySettingsButton: { kind: 'value', value: true, updatedAt: 2 },
        overlayHotkeyHints: { kind: 'value', value: false, updatedAt: 3 },
        overlayHoverHold: { kind: 'value', value: false, updatedAt: 4 },
      }),
    ).toEqual({
      overlayPositionButton: { kind: 'value', value: false, updatedAt: 1 },
      overlaySettingsButton: { kind: 'value', value: true, updatedAt: 2 },
      overlayHotkeyHints: { kind: 'value', value: false, updatedAt: 3 },
      overlayHoverHold: { kind: 'value', value: false, updatedAt: 4 },
    });
  });
});

describe('behavior setting changes', () => {
  it('copies unrelated overrides and timestamps unchanged', () => {
    const current = {
      speed: { kind: 'value' as const, value: 1.5, updatedAt: 10 },
      overlayPosition: {
        kind: 'value' as const,
        value: OVERLAY_POSITION.TOP_CENTER,
        updatedAt: 11,
      },
      overlayAutoHide: { kind: 'inherit' as const, updatedAt: 12 },
    };
    const next = applyBehaviorSettingChange(
      current,
      { kind: 'value', field: 'overlayAutoHideDelayMs', value: 2500 },
      99,
    );
    expect(next.speed).toEqual(current.speed);
    expect(next.overlayPosition).toEqual(current.overlayPosition);
    expect(next.overlayAutoHide).toEqual(current.overlayAutoHide);
    expect(next.overlayAutoHideDelayMs).toEqual({ kind: 'value', value: 2500, updatedAt: 99 });
  });

  it('wraps speed value and inherit helpers', () => {
    const current = {
      overlayPosition: {
        kind: 'value' as const,
        value: OVERLAY_POSITION.BOTTOM_RIGHT,
        updatedAt: 3,
      },
    };
    expect(withSpeedValue(current, 2, 8)).toEqual({
      ...current,
      speed: { kind: 'value', value: 2, updatedAt: 8 },
    });
    expect(withSpeedInherit(current, 9)).toEqual({
      ...current,
      speed: { kind: 'inherit', updatedAt: 9 },
    });
  });

  it('canonicalizes overlay opacity to an integer percent', () => {
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayOpacity',
        value: 40.4,
      }),
    ).toEqual({ kind: 'value', field: 'overlayOpacity', value: 40 });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayOpacity',
        value: -1,
      }),
    ).toBeNull();
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayOpacity',
        value: 0,
      }),
    ).toEqual({ kind: 'value', field: 'overlayOpacity', value: OVERLAY_OPACITY_MIN });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayOpacity',
        value: 150,
      }),
    ).toEqual({ kind: 'value', field: 'overlayOpacity', value: OVERLAY_OPACITY_MAX });
  });

  it('canonicalizes delay to integer milliseconds and clamps speed', () => {
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayAutoHideDelayMs',
        value: 2500.4,
      }),
    ).toEqual({ kind: 'value', field: 'overlayAutoHideDelayMs', value: 2500 });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayAutoHideDelayMs',
        value: -1,
      }),
    ).toBeNull();
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayAutoHideDelayMs',
        value: 0,
      }),
    ).toEqual({
      kind: 'value',
      field: 'overlayAutoHideDelayMs',
      value: OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
    });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayAutoHideDelayMs',
        value: 50,
      }),
    ).toEqual({
      kind: 'value',
      field: 'overlayAutoHideDelayMs',
      value: OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
    });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayAutoHideDelayMs',
        value: 400_000,
      }),
    ).toEqual({
      kind: 'value',
      field: 'overlayAutoHideDelayMs',
      value: OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
    });
    expect(canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speed', value: 9 })).toEqual({
      kind: 'value',
      field: 'speed',
      value: 9,
    });
    expect(canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speed', value: 20 })).toEqual(
      {
        kind: 'value',
        field: 'speed',
        value: 16,
      },
    );
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speedMax', value: 10 }),
    ).toEqual({ kind: 'value', field: 'speedMax', value: 10 });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speedMax', value: 20 }),
    ).toEqual({ kind: 'value', field: 'speedMax', value: 16 });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speedMax', value: 1 }),
    ).toEqual({ kind: 'value', field: 'speedMax', value: 1 });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speedMax', value: 0.5 }),
    ).toEqual({ kind: 'value', field: 'speedMax', value: SPEED_MAX_SETTING_MIN });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speedMin', value: 1 }),
    ).toEqual({ kind: 'value', field: 'speedMin', value: 1 });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speedMin', value: 0.01 }),
    ).toEqual({ kind: 'value', field: 'speedMin', value: 0.0625 });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speedMin', value: 0.0625 }),
    ).toEqual({ kind: 'value', field: 'speedMin', value: 0.0625 });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speedTick', value: 0.1 }),
    ).toEqual({ kind: 'value', field: 'speedTick', value: 0.1 });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speedTick', value: 0.0005 }),
    ).toEqual({ kind: 'value', field: 'speedTick', value: 0.0005 });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'value', field: 'speedTick', value: 0.0001 }),
    ).toEqual({ kind: 'value', field: 'speedTick', value: 0.0005 });
    expect(
      canonicalizeBehaviorSettingChange({ kind: 'inherit', field: 'overlayPosition' }),
    ).toEqual({ kind: 'inherit', field: 'overlayPosition' });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayPositionButton',
        value: false,
      }),
    ).toEqual({ kind: 'value', field: 'overlayPositionButton', value: false });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlaySettingsButton',
        value: true,
      }),
    ).toEqual({ kind: 'value', field: 'overlaySettingsButton', value: true });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayHotkeyHints',
        value: false,
      }),
    ).toEqual({ kind: 'value', field: 'overlayHotkeyHints', value: false });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'buttonFlash',
        value: true,
      }),
    ).toEqual({ kind: 'value', field: 'buttonFlash', value: true });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'hotkeyFlash',
        value: false,
      }),
    ).toEqual({ kind: 'value', field: 'hotkeyFlash', value: false });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'flashDelayMs',
        value: 0,
      }),
    ).toEqual({ kind: 'value', field: 'flashDelayMs', value: FLASH_DELAY_MS_MIN });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'flashOpacity',
        value: 40.4,
      }),
    ).toEqual({ kind: 'value', field: 'flashOpacity', value: 40 });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'flashOpacity',
        value: 0,
      }),
    ).toEqual({ kind: 'value', field: 'flashOpacity', value: FLASH_OPACITY_MIN });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'flashOpacity',
        value: 150,
      }),
    ).toEqual({ kind: 'value', field: 'flashOpacity', value: FLASH_OPACITY_MAX });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'flashDelayMs',
        value: 99_000,
      }),
    ).toEqual({ kind: 'value', field: 'flashDelayMs', value: FLASH_DELAY_MS_MAX });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'hotkeyRepeat',
        value: true,
      }),
    ).toEqual({ kind: 'value', field: 'hotkeyRepeat', value: true });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'hotkeyRepeatDelayMs',
        value: 0,
      }),
    ).toEqual({
      kind: 'value',
      field: 'hotkeyRepeatDelayMs',
      value: HOTKEY_REPEAT_DELAY_MS_MIN,
    });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'hotkeyRepeatRate',
        value: 14.73,
      }),
    ).toEqual({ kind: 'value', field: 'hotkeyRepeatRate', value: 14.5 });
    expect(
      canonicalizeBehaviorSettingChange({
        kind: 'value',
        field: 'overlayPositionButton',
        value: 'yes',
      } as never),
    ).toBeNull();
  });

  it('tombstones existing site fields and leaves absent fields absent', () => {
    expect(
      tombstoneExistingSiteSettings(
        {
          speed: { kind: 'value', value: 2, updatedAt: 100 },
          overlayVisible: { kind: 'inherit', updatedAt: 80 },
        },
        200,
      ),
    ).toEqual({
      speed: { kind: 'inherit', updatedAt: 200 },
      overlayVisible: { kind: 'inherit', updatedAt: 200 },
    });
    expect(tombstoneExistingSiteSettings({}, 200)).toEqual({});
    expect(
      tombstoneExistingSiteSettings(
        {
          hotkeys: {
            increaseSpeed: { kind: 'value', value: null, updatedAt: 100 },
          },
        },
        200,
      ),
    ).toEqual({
      hotkeys: { increaseSpeed: { kind: 'inherit', updatedAt: 200 } },
    });
    expect(Object.keys(inheritAllKnownSettings(5)).sort()).toEqual(
      [...EDITABLE_BEHAVIOR_FIELDS, 'hotkeys'].sort(),
    );
    expect(inheritAllKnownSettings(5).hotkeys).toEqual(
      Object.fromEntries(
        SITE_HOTKEY_ACTIONS.map((action) => [action, { kind: 'inherit', updatedAt: 5 }]),
      ),
    );
  });
});
