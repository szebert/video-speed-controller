// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import {
  persistGlobalBehaviorChange,
  persistGlobalBehaviorOverrides,
  readGlobalBehaviorOverrides,
  resetBehaviorDefaultsRepairBackoff,
  resetGlobalBehaviorOverrides,
} from '../storage/behavior-defaults';
import { EDITABLE_BEHAVIOR_FIELDS, OVERLAY_POSITION } from '../settings/site-behavior';
import { resetStorageMutationQueue } from '../storage/storage-mutation-queue';
import { memoryDurable } from './memory-store';

describe('global behavior defaults', () => {
  beforeEach(() => {
    resetBehaviorDefaultsRepairBackoff();
    resetStorageMutationQueue();
  });

  it('merges independent fields and never expires inherit tombstones', async () => {
    const sync = memoryDurable({
      'defaults:site-behavior': {
        schemaVersion: 1,
        overrides: {
          speed: { kind: 'value', value: 1.25, updatedAt: 10 },
          overlayPosition: { kind: 'inherit', updatedAt: 1 },
        },
      },
    });
    const local = memoryDurable({
      'defaults:site-behavior': {
        schemaVersion: 1,
        overrides: { overlayAutoHide: { kind: 'value', value: true, updatedAt: 20 } },
      },
    });
    const merged = await readGlobalBehaviorOverrides({ sync, local, now: () => 50 });
    expect(merged.speed).toEqual({ kind: 'value', value: 1.25, updatedAt: 10 });
    expect(merged.overlayPosition).toEqual({ kind: 'inherit', updatedAt: 1 });
    expect(merged.overlayAutoHide).toEqual({ kind: 'value', value: true, updatedAt: 20 });
    expect(sync.data['defaults:site-behavior']).toMatchObject({
      overrides: { overlayAutoHide: { kind: 'value', value: true, updatedAt: 20 } },
    });
  });

  it('preserves unrelated fields when mutating one global override', async () => {
    const sync = memoryDurable();
    const local = memoryDurable();
    await persistGlobalBehaviorOverrides(
      (current, now) => ({
        ...current,
        overlayPosition: { kind: 'value', value: OVERLAY_POSITION.BOTTOM_LEFT, updatedAt: now },
      }),
      { sync, local, now: () => 9 },
    );
    await persistGlobalBehaviorOverrides(
      (current, now) => ({ ...current, speed: { kind: 'value', value: 1.5, updatedAt: now } }),
      { sync, local, now: () => 11 },
    );
    expect(sync.data['defaults:site-behavior']).toMatchObject({
      overrides: {
        overlayPosition: { kind: 'value', value: OVERLAY_POSITION.BOTTOM_LEFT, updatedAt: 9 },
        speed: { kind: 'value', value: 1.5, updatedAt: 11 },
      },
    });
  });

  it('persists one field without rewriting unrelated timestamps', async () => {
    const sync = memoryDurable();
    const local = memoryDurable();
    await persistGlobalBehaviorChange(
      { kind: 'value', field: 'overlayPosition', value: OVERLAY_POSITION.BOTTOM_LEFT },
      { sync, local, now: () => 9 },
    );
    await persistGlobalBehaviorChange(
      { kind: 'value', field: 'speed', value: 1.5 },
      { sync, local, now: () => 11 },
    );
    expect(sync.data['defaults:site-behavior']).toMatchObject({
      overrides: {
        overlayPosition: { kind: 'value', value: OVERLAY_POSITION.BOTTOM_LEFT, updatedAt: 9 },
        speed: { kind: 'value', value: 1.5, updatedAt: 11 },
      },
    });
  });

  it('writes inherit tombstones for every editable field on reset', async () => {
    const sync = memoryDurable();
    const local = memoryDurable();
    await persistGlobalBehaviorChange(
      { kind: 'value', field: 'speed', value: 1.5 },
      { sync, local, now: () => 10 },
    );
    await resetGlobalBehaviorOverrides({ sync, local, now: () => 200 });
    const overrides = (
      local.data['defaults:site-behavior'] as { overrides: Record<string, unknown> }
    ).overrides;
    expect(Object.keys(overrides)).toEqual([...EDITABLE_BEHAVIOR_FIELDS]);
    for (const field of EDITABLE_BEHAVIOR_FIELDS) {
      expect(overrides[field]).toEqual({ kind: 'inherit', updatedAt: 200 });
    }
    expect(sync.data['defaults:site-behavior']).toMatchObject({ overrides });
  });

  it('treats a non-Error rejection as a persistence failure', async () => {
    await expect(
      persistGlobalBehaviorOverrides((current) => current, {
        sync: {
          ...memoryDurable(),
          async set() {
            return Promise.reject('quota');
          },
        },
        local: memoryDurable(),
        now: () => 1,
      }),
    ).rejects.toThrow(/Failed to persist global behavior/);
  });
});
