// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED_POLICY } from '../core/speed';
import {
  mergeOverrideField,
  overlayPositionFromGrid,
  overlayPositionToGrid,
  parseBehaviorOverrides,
  parseGlobalBehaviorSettings,
  parseSiteSettings,
  resolveSiteBehavior,
  toEffectiveBehavior,
  toSyncEligibleSiteRecord,
  isOverlayPosition,
  OVERLAY_POSITION,
  SITE_INHERIT_SYNC_RETENTION_MS,
  type Override,
} from '../settings/site-behavior';

describe('site behavior resolution', () => {
  it('uses built-in defaults when no overrides exist', () => {
    const resolved = resolveSiteBehavior({}, {});
    expect(resolved.speed).toEqual({ value: 1, source: 'built-in' });
    expect(resolved.overlayPosition).toEqual({
      value: OVERLAY_POSITION.TOP_CENTER,
      source: 'built-in',
    });
    expect(resolved.overlayAutoHide).toEqual({ value: false, source: 'built-in' });
    expect(toEffectiveBehavior(resolved).speed).toBe(resolved.speed.value);
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

  it('merges hotkey actions independently without treating a persisted binding as valid V1', () => {
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

describe('strict V1 parsers', () => {
  it('rejects unknown keys leftover inherit values and empty site records', () => {
    expect(
      parseSiteSettings({
        schemaVersion: 1,
        lastUsedAt: 1,
        overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 1 } },
        extra: true,
      }),
    ).toBeNull();
    expect(
      parseBehaviorOverrides({
        speed: { kind: 'value', value: 1.5, updatedAt: 1 },
        overlayPositon: { kind: 'inherit', updatedAt: 1 },
      }),
    ).toBeNull();
    expect(
      parseBehaviorOverrides({ speed: { kind: 'inherit', updatedAt: 1, value: 1.5 } }),
    ).toBeNull();
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
  });
});
