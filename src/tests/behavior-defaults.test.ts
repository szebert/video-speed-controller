// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { readAppliedTabPayload } from '../background/applied-behavior';
import { EDITABLE_BEHAVIOR_FIELDS, OVERLAY_POSITION } from '../settings/site-behavior';
import {
  persistGlobalBehaviorChange,
  persistGlobalBehaviorOverrides,
  persistGlobalHotkeyChanges,
  readGlobalBehaviorOverrides,
  resetBehaviorDefaultsRepairBackoff,
  resetGlobalBehaviorOverrides,
} from '../storage/behavior-defaults';
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
    expect(Object.keys(overrides).sort()).toEqual([...EDITABLE_BEHAVIOR_FIELDS, 'hotkeys'].sort());
    for (const field of EDITABLE_BEHAVIOR_FIELDS) {
      expect(overrides[field]).toEqual({ kind: 'inherit', updatedAt: 200 });
    }
    expect(overrides.hotkeys).toEqual({
      increaseSpeed: { kind: 'inherit', updatedAt: 200 },
      decreaseSpeed: { kind: 'inherit', updatedAt: 200 },
      resetSpeed: { kind: 'inherit', updatedAt: 200 },
    });
    expect(sync.data['defaults:site-behavior']).toMatchObject({ overrides });
  });

  it('does not reset when any global copy is a newer schema', async () => {
    const sync = memoryDurable({
      'defaults:site-behavior': { schemaVersion: 2, overrides: { extra: true } },
    });
    const local = memoryDurable({
      'defaults:site-behavior': {
        schemaVersion: 1,
        overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 1 } },
      },
    });
    await expect(resetGlobalBehaviorOverrides({ sync, local, now: () => 9 })).rejects.toThrow(
      /newer version/i,
    );
    expect(sync.data['defaults:site-behavior']).toEqual({
      schemaVersion: 2,
      overrides: { extra: true },
    });
  });

  it('does not reset when global extras.overrides are opaque', async () => {
    const record = {
      schemaVersion: 1,
      overrides: {
        speed: { kind: 'value', value: 1.5, updatedAt: 1 },
        seekInterval: { kind: 'value', value: 10, updatedAt: 1 },
      },
    };
    const sync = memoryDurable({ 'defaults:site-behavior': record });
    const local = memoryDurable({ 'defaults:site-behavior': record });
    await expect(resetGlobalBehaviorOverrides({ sync, local, now: () => 9 })).rejects.toThrow(
      /newer version/i,
    );
    expect(sync.data['defaults:site-behavior']).toEqual(record);
    expect(local.data['defaults:site-behavior']).toEqual(record);
  });

  it('skips opaque global extras.overrides during Reset All without aborting', async () => {
    const record = {
      schemaVersion: 1,
      overrides: { seekInterval: { kind: 'value', value: 10, updatedAt: 1 } },
    };
    const sync = memoryDurable({ 'defaults:site-behavior': record });
    const local = memoryDurable();
    await expect(
      resetGlobalBehaviorOverrides({ sync, local, now: () => 9 }, { ifUnsupported: 'skip' }),
    ).resolves.toBe('skipped');
    expect(sync.data['defaults:site-behavior']).toEqual(record);
  });

  it('skips an unsupported global record during Reset All without aborting', async () => {
    const sync = memoryDurable({
      'defaults:site-behavior': { schemaVersion: 2, overrides: { extra: true } },
    });
    const local = memoryDurable();
    await expect(
      resetGlobalBehaviorOverrides({ sync, local, now: () => 9 }, { ifUnsupported: 'skip' }),
    ).resolves.toBe('skipped');
    expect(sync.data['defaults:site-behavior']).toEqual({
      schemaVersion: 2,
      overrides: { extra: true },
    });
  });

  it('round-trips a global hotkey override through applied tab payload', async () => {
    const sync = memoryDurable();
    const local = memoryDurable();
    const binding = {
      code: 'KeyJ',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    await persistGlobalHotkeyChanges(
      [{ kind: 'hotkey-value', action: 'increaseSpeed', value: binding }],
      { sync, local, now: () => 40 },
    );
    const stored = (local.data['defaults:site-behavior'] as { overrides: { hotkeys: unknown } })
      .overrides.hotkeys;
    expect(stored).toEqual({
      increaseSpeed: { kind: 'value', value: binding, updatedAt: 40 },
    });
    const payload = await readAppliedTabPayload('https://www.youtube.com/watch', {
      sync,
      local,
      now: () => 40,
      touchUsage: false,
    });
    expect(payload.hotkeys.increaseSpeed).toEqual(binding);
    expect(payload.hotkeys.decreaseSpeed).toEqual({
      code: 'BracketLeft',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    });
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
        local: {
          ...memoryDurable(),
          async set() {
            return Promise.reject('quota');
          },
        },
        now: () => 1,
      }),
    ).rejects.toThrow(/quota/);
  });
});
