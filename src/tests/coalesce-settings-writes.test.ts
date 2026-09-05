// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSettingsWriteCoalescer,
  SETTINGS_WRITE_COALESCE_MS,
  type SettingsWriteBatch,
} from '../entrypoints/options/coalesce-settings-writes';
import type { BehaviorSettingChange } from '../settings/site-behavior';

const speed = (value: number): BehaviorSettingChange => ({
  kind: 'value',
  field: 'speed',
  value,
});

const overlay = (value: boolean): BehaviorSettingChange => ({
  kind: 'value',
  field: 'overlayVisible',
  value,
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('settings write coalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the first change immediately', async () => {
    const sent: SettingsWriteBatch[] = [];
    const coalescer = createSettingsWriteCoalescer({
      send: async (batch) => {
        sent.push(batch);
      },
    });
    coalescer.enqueue({ kind: 'global' }, speed(1.25));
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toEqual([
      {
        scope: { kind: 'global' },
        changes: [speed(1.25)],
      },
    ]);
  });

  it('keeps the latest value for a field before the leading drain', async () => {
    const sent: SettingsWriteBatch[] = [];
    const coalescer = createSettingsWriteCoalescer({
      send: async (batch) => {
        sent.push(batch);
      },
    });
    coalescer.enqueue({ kind: 'global' }, speed(1.25));
    coalescer.enqueue({ kind: 'global' }, speed(1.5));
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.changes).toEqual([speed(1.5)]);
  });

  it('holds one persist in flight and drains the latest pending after it', async () => {
    const sent: SettingsWriteBatch[] = [];
    const first = deferred<void>();
    const coalescer = createSettingsWriteCoalescer({
      send: async (batch) => {
        sent.push(batch);
        if (sent.length === 1) {
          await first.promise;
        }
      },
    });
    coalescer.enqueue({ kind: 'global' }, speed(1.25));
    await Promise.resolve();
    await Promise.resolve();
    coalescer.enqueue({ kind: 'global' }, speed(1.5));
    coalescer.enqueue({ kind: 'global' }, overlay(false));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.changes).toEqual([speed(1.25)]);
    first.resolve();
    await first.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.changes).toEqual([speed(1.5), overlay(false)]);
  });

  it('does not start a second persist while the first is in flight', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const first = deferred<void>();
    const coalescer = createSettingsWriteCoalescer({
      send: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (inFlight === 1) {
          await first.promise;
        }
        inFlight -= 1;
      },
    });
    coalescer.enqueue({ kind: 'global' }, speed(1.25));
    await Promise.resolve();
    await Promise.resolve();
    coalescer.enqueue({ kind: 'global' }, speed(1.5));
    expect(maxInFlight).toBe(1);
    first.resolve();
    await first.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(maxInFlight).toBe(1);
  });

  it('flushes different scopes as separate writes', async () => {
    const sent: SettingsWriteBatch[] = [];
    const first = deferred<void>();
    const coalescer = createSettingsWriteCoalescer({
      send: async (batch) => {
        sent.push(batch);
        if (sent.length === 1) {
          await first.promise;
        }
      },
    });
    coalescer.enqueue({ kind: 'site', hostname: 'www.youtube.com' }, speed(1.25));
    await Promise.resolve();
    await Promise.resolve();
    coalescer.enqueue({ kind: 'site', hostname: 'www.netflix.com' }, speed(1.5));
    first.resolve();
    await first.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(sent.map((batch) => batch.scope)).toEqual([
      { kind: 'site', hostname: 'www.youtube.com' },
      { kind: 'site', hostname: 'www.netflix.com' },
    ]);
  });

  it('coalesces further quiet-period changes until the trailing timer', async () => {
    const sent: SettingsWriteBatch[] = [];
    const coalescer = createSettingsWriteCoalescer({
      send: async (batch) => {
        sent.push(batch);
      },
    });
    coalescer.enqueue({ kind: 'global' }, speed(1.25));
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    coalescer.enqueue({ kind: 'global' }, speed(1.5));
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(SETTINGS_WRITE_COALESCE_MS);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.changes).toEqual([speed(1.5)]);
  });

  it('flush sends pending trailing changes immediately', async () => {
    const sent: SettingsWriteBatch[] = [];
    const coalescer = createSettingsWriteCoalescer({
      send: async (batch) => {
        sent.push(batch);
      },
    });
    coalescer.enqueue({ kind: 'global' }, speed(1.25));
    await Promise.resolve();
    await Promise.resolve();
    coalescer.enqueue({ kind: 'global' }, speed(1.5));
    await coalescer.flush();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.changes).toEqual([speed(1.5)]);
  });
});
