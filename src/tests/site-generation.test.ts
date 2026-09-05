// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { parseReadySiteSettings } from '../settings/behavior-schema';
import { migrateSiteSettings } from '../settings/migrate';
import {
  mergeGenerationEpochs,
  parseSiteGenerationRecord,
  parseSiteRecordGeneration,
  replicaNeedsGenerationRepair,
  shouldApplySiteCopy,
  siteGenerationEligibility,
} from '../storage/site-generation';

describe('site generation metadata', () => {
  it('treats missing metadata as epoch 0 and field-precise salvage keeps a valid epoch', () => {
    expect(parseSiteGenerationRecord(undefined)).toEqual({ status: 'absent' });
    expect(mergeGenerationEpochs({ status: 'absent' }, { status: 'absent' })).toEqual({
      status: 'known',
      epoch: 0,
    });
    expect(
      parseSiteGenerationRecord({
        schemaVersion: 1,
        epoch: 8,
        updatedAt: Number.MAX_SAFE_INTEGER,
      }),
    ).toEqual({
      status: 'valid',
      value: { schemaVersion: 1, epoch: 8 },
    });
    expect(
      mergeGenerationEpochs(
        { status: 'valid', value: { schemaVersion: 1, epoch: 7 } },
        parseSiteGenerationRecord({
          schemaVersion: 1,
          epoch: 8,
          updatedAt: 'nope',
        }),
      ),
    ).toEqual({ status: 'known', epoch: 8 });
  });

  it('makes merged generation unknown when either replica is corrupt or unsupported', () => {
    expect(
      mergeGenerationEpochs(
        { status: 'valid', value: { schemaVersion: 1, epoch: 7 } },
        { status: 'corrupt' },
      ),
    ).toEqual({ status: 'unknown' });
    expect(
      mergeGenerationEpochs(
        { status: 'valid', value: { schemaVersion: 1, epoch: 7 } },
        { status: 'unsupported' },
      ),
    ).toEqual({ status: 'unknown' });
    expect(mergeGenerationEpochs({ status: 'corrupt' }, { status: 'absent' })).toEqual({
      status: 'unknown',
    });
    expect(parseSiteGenerationRecord({ schemaVersion: 1, epoch: Number.MAX_SAFE_INTEGER })).toEqual({
      status: 'corrupt',
    });
    expect(parseSiteGenerationRecord({ schemaVersion: 2, epoch: 1 })).toEqual({
      status: 'unsupported',
    });
  });

  it('repairs known replicas upward only', () => {
    expect(
      replicaNeedsGenerationRepair({ status: 'valid', value: { schemaVersion: 1, epoch: 7 } }, 8),
    ).toBe(true);
    expect(
      replicaNeedsGenerationRepair({ status: 'valid', value: { schemaVersion: 1, epoch: 8 } }, 8),
    ).toBe(false);
    expect(
      replicaNeedsGenerationRepair({ status: 'valid', value: { schemaVersion: 1, epoch: 8 } }, 7),
    ).toBe(false);
    expect(replicaNeedsGenerationRepair({ status: 'absent' }, 8)).toBe(true);
    expect(replicaNeedsGenerationRepair({ status: 'absent' }, 0)).toBe(false);
    expect(replicaNeedsGenerationRepair({ status: 'corrupt' }, 8)).toBe(false);
    expect(replicaNeedsGenerationRepair({ status: 'unsupported' }, 8)).toBe(false);
  });
});

describe('site record generation', () => {
  it('treats only true absence as generation 0', () => {
    expect(parseSiteRecordGeneration({ schemaVersion: 1, lastUsedAt: 1, overrides: {} })).toEqual({
      status: 'legacy',
      value: 0,
    });
    expect(
      parseSiteRecordGeneration({
        schemaVersion: 1,
        lastUsedAt: 1,
        overrides: {},
        generation: 7,
      }),
    ).toEqual({ status: 'valid', value: 7 });
    expect(
      parseSiteRecordGeneration({
        schemaVersion: 1,
        lastUsedAt: 1,
        overrides: {},
        generation: Number.MAX_SAFE_INTEGER,
      }),
    ).toEqual({ status: 'unknown' });
  });

  it('does not salvage a malformed generation field into a ready gen-0 record', () => {
    const raw = {
      schemaVersion: 1 as const,
      lastUsedAt: 1,
      generation: 'nope',
      overrides: { speed: { kind: 'value' as const, value: 2, updatedAt: 1 } },
    };
    const parsed = parseReadySiteSettings(raw);
    expect(parsed?.record.generation).toBeUndefined();
    expect(parsed?.extras.record.generation).toBe('nope');
    expect(parseSiteRecordGeneration(raw).status).toBe('unknown');
    expect(migrateSiteSettings(raw).status).toBe('ready');
    expect(
      shouldApplySiteCopy(migrateSiteSettings(raw), raw, { status: 'known', epoch: 0 }),
    ).toBe(false);
  });

  it('applies only generation-eligible copies', () => {
    const ready = migrateSiteSettings({
      schemaVersion: 1,
      lastUsedAt: 1,
      generation: 6,
      overrides: { speed: { kind: 'value', value: 2, updatedAt: 1e12 } },
    });
    expect(siteGenerationEligibility({ status: 'valid', value: 6 }, { status: 'known', epoch: 7 })).toEqual(
      { status: 'stale', generation: 6 },
    );
    expect(shouldApplySiteCopy(ready, { generation: 6 }, { status: 'known', epoch: 7 })).toBe(false);
    expect(shouldApplySiteCopy(ready, { generation: 7 }, { status: 'known', epoch: 7 })).toBe(true);
    expect(shouldApplySiteCopy(ready, { generation: 8 }, { status: 'known', epoch: 7 })).toBe(false);
    expect(shouldApplySiteCopy(ready, { generation: 7 }, { status: 'unknown' })).toBe(false);
  });
});
