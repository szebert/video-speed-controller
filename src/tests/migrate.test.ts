// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  detectVersion,
  migrateGlobalBehaviorSettings,
  migrateSiteSettings,
} from '../settings/migrate';
import { parseReadySiteSettings } from '../settings/behavior-schema';
import { migrateThemeRecord } from '../settings/theme';
import { reapplyModeForFields } from '../background/reapply-behavior-settings';

describe('detectVersion', () => {
  it('accepts only positive safe integers', () => {
    expect(detectVersion({ schemaVersion: 1 })).toBe(1);
    expect(detectVersion({ schemaVersion: 2 })).toBe(2);
    expect(detectVersion({ schemaVersion: 1.5 })).toBeNull();
    expect(detectVersion({ schemaVersion: -1 })).toBeNull();
    expect(detectVersion({ schemaVersion: Number.NaN })).toBeNull();
    expect(detectVersion({ schemaVersion: '2' })).toBeNull();
  });
});

describe('migrate settings', () => {
  it('classifies newer schemas as unsupported', () => {
    expect(migrateSiteSettings({ schemaVersion: 2, overrides: {}, lastUsedAt: 1 })).toEqual({
      status: 'unsupported',
      schemaVersion: 2,
    });
    expect(migrateGlobalBehaviorSettings({ schemaVersion: 2, overrides: {} })).toEqual({
      status: 'unsupported',
      schemaVersion: 2,
    });
    expect(migrateThemeRecord({ schemaVersion: 2, preference: 'dark' })).toEqual({
      status: 'unsupported',
      schemaVersion: 2,
    });
  });

  it('preserves unknown override keys and drops a malformed known field', () => {
    const parsed = parseReadySiteSettings({
      schemaVersion: 1,
      lastUsedAt: 9,
      extra: true,
      overrides: {
        speed: { kind: 'value', value: 'garbage', updatedAt: 9 },
        overlayVisible: { kind: 'value', value: false, updatedAt: 9 },
        seekInterval: { kind: 'value', value: 10, updatedAt: 9 },
        speedWithInner: { kind: 'value', value: 1.5, updatedAt: 9, sourceDevice: 'abc' },
      },
    });
    expect(parsed?.record.overrides.overlayVisible).toEqual({
      kind: 'value',
      value: false,
      updatedAt: 9,
    });
    expect(parsed?.record.overrides.speed).toBeUndefined();
    expect(parsed?.extras.record).toEqual({ extra: true });
    expect(parsed?.extras.overrides.seekInterval).toEqual({
      kind: 'value',
      value: 10,
      updatedAt: 9,
    });
  });

  it('treats extra inner keys on a known override as a field failure', () => {
    const parsed = parseReadySiteSettings({
      schemaVersion: 1,
      lastUsedAt: 1,
      overrides: {
        speed: { kind: 'value', value: 1.5, updatedAt: 1, sourceDevice: 'abc' },
        overlayVisible: { kind: 'value', value: true, updatedAt: 1 },
      },
    });
    expect(parsed?.record.overrides.speed).toBeUndefined();
    expect(parsed?.record.overrides.overlayVisible).toEqual({
      kind: 'value',
      value: true,
      updatedAt: 1,
    });
  });

  it('keeps a site record that only has unknown overrides', () => {
    const parsed = migrateSiteSettings({
      schemaVersion: 1,
      lastUsedAt: 1,
      overrides: { seekInterval: { kind: 'value', value: 10, updatedAt: 1 } },
    });
    expect(parsed.status).toBe('ready');
    if (parsed.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(parsed.record.overrides).toEqual({});
    expect(parsed.extras.overrides.seekInterval).toEqual({
      kind: 'value',
      value: 10,
      updatedAt: 1,
    });
  });
});

describe('reapplyModeForFields', () => {
  it('uses the strongest mode in the batch', () => {
    expect(reapplyModeForFields('site', [{ field: 'speed' }, { field: 'overlayVisible' }])).toBe(
      'resolve-target',
    );
    expect(reapplyModeForFields('site', [{ field: 'speedMax' }, { field: 'overlayVisible' }])).toBe(
      'revalidate-target',
    );
    expect(
      reapplyModeForFields('site', [{ field: 'overlayPosition' }, { field: 'overlayVisible' }]),
    ).toBe('preserve-target');
    expect(reapplyModeForFields('global', [{ field: 'speed' }])).toBe('none');
  });
});
