// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED_POLICY } from '../core/speed';
import {
  mergeOverrideField,
  parseSiteSettings,
  resolveSiteBehavior,
  toEffectiveBehavior,
  toSyncEligibleSiteRecord,
  SITE_INHERIT_SYNC_RETENTION_MS,
  type Override,
} from '../settings/site-behavior';

describe('site behavior resolution', () => {
  it('uses built-in defaults when no overrides exist', () => {
    const resolved = resolveSiteBehavior({}, {});
    expect(resolved.speed).toEqual({ value: 1, source: 'built-in' });
    expect(resolved.overlayPosition).toEqual({ value: 'top-center', source: 'built-in' });
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
        overlayPosition: { kind: 'value', value: 'bottom-right', updatedAt: 10 },
      },
      { speed: { kind: 'value', value: 1.75, updatedAt: 20 } },
    );
    expect(resolved.speed.source).toBe('site');
    expect(resolved.overlayPosition).toEqual({ value: 'bottom-right', source: 'global' });
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
