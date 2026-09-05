// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED_POLICY } from '../core/speed';
import {
  applyBehaviorSettingChange,
  canonicalizeBehaviorSettingChange,
  EDITABLE_BEHAVIOR_FIELDS,
  inheritAllEditableFields,
  tombstoneExistingSiteFields,
  mergeOverrideField,
  OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
  OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
  overlayPositionFromGrid,
  overlayPositionToGrid,
  resolveSiteBehavior,
  toEffectiveBehavior,
  toSyncEligibleSiteRecord,
  isOverlayPosition,
  OVERLAY_POSITION,
  SITE_INHERIT_SYNC_RETENTION_MS,
  withSpeedInherit,
  withSpeedValue,
  type Override,
} from '../settings/site-behavior';
import {
  parseBehaviorOverrides,
  parseGlobalBehaviorSettings,
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
    expect(resolved.overlayAutoHide).toEqual({ value: true, source: 'built-in' });
    expect(resolved.overlayHoverHold).toEqual({ value: false, source: 'built-in' });
    expect(resolved.overlayAutoHideDelayMs).toEqual({ value: 2000, source: 'built-in' });
    expect(toEffectiveBehavior(resolved).speed).toBe(resolved.speed.value);
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

  it('merges hotkey actions independently without treating a persisted binding as a known V1 field', () => {
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
    ).toEqual({ schemaVersion: 1, lastUsedAt: 1, overrides: {} });
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
        overlayHoverHold: { kind: 'value', value: false, updatedAt: 3 },
      }),
    ).toEqual({
      overlayPositionButton: { kind: 'value', value: false, updatedAt: 1 },
      overlaySettingsButton: { kind: 'value', value: true, updatedAt: 2 },
      overlayHoverHold: { kind: 'value', value: false, updatedAt: 3 },
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
        field: 'overlayPositionButton',
        value: 'yes',
      } as never),
    ).toBeNull();
  });

  it('tombstones existing site fields and leaves absent fields absent', () => {
    expect(
      tombstoneExistingSiteFields(
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
    expect(tombstoneExistingSiteFields({}, 200)).toEqual({});
    expect(Object.keys(inheritAllEditableFields(5))).toEqual([...EDITABLE_BEHAVIOR_FIELDS]);
  });
});
