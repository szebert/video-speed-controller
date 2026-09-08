// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSettingsWriteCoalescer,
  flushSettingsWriteQueues,
  SETTINGS_WRITE_COALESCE_MS,
  settingsWriteQueuesBusy,
  type SettingsWriteBatch,
} from '../entrypoints/options/coalesce-settings-writes';
import type { BehaviorSettingChange, HotkeySettingChange } from '../settings/site-behavior';

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

const hotkey = (action: HotkeySettingChange['action'], code: string): HotkeySettingChange => ({
  kind: 'hotkey-value',
  action,
  value: { code, ctrl: false, alt: false, shift: false, meta: false },
});

function fieldKey(change: BehaviorSettingChange): string {
  return change.field;
}

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
      key: fieldKey,
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
      key: fieldKey,
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
      key: fieldKey,
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
      key: fieldKey,
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
      key: fieldKey,
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
      key: fieldKey,
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
      key: fieldKey,
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

  it('keys hotkey writes by action', async () => {
    const sent: SettingsWriteBatch<HotkeySettingChange>[] = [];
    const coalescer = createSettingsWriteCoalescer<HotkeySettingChange>({
      key: (change) => change.action,
      send: async (batch) => {
        sent.push(batch);
      },
    });
    coalescer.enqueue({ kind: 'global' }, hotkey('decreaseSpeed', 'KeyA'));
    coalescer.enqueue({ kind: 'global' }, hotkey('increaseSpeed', 'KeyB'));
    coalescer.enqueue({ kind: 'global' }, hotkey('decreaseSpeed', 'KeyC'));
    await Promise.resolve();
    await Promise.resolve();
    expect(sent[0]?.changes).toEqual([
      hotkey('decreaseSpeed', 'KeyC'),
      hotkey('increaseSpeed', 'KeyB'),
    ]);
  });

  it('flushes write queues in the given order and reports busy across them', async () => {
    const sent: string[] = [];
    const first = deferred<void>();
    const firstQueue = createSettingsWriteCoalescer({
      key: fieldKey,
      send: async () => {
        sent.push('first');
        await first.promise;
      },
    });
    const secondQueue = createSettingsWriteCoalescer({
      key: fieldKey,
      send: async () => {
        sent.push('second');
      },
    });
    firstQueue.enqueue({ kind: 'global' }, speed(1.25));
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toEqual(['first']);
    expect(settingsWriteQueuesBusy(firstQueue, secondQueue)).toBe(true);
    secondQueue.enqueue({ kind: 'global' }, speed(1.5));
    first.resolve();
    await flushSettingsWriteQueues(firstQueue, secondQueue);
    expect(sent).toEqual(['first', 'second']);
    expect(settingsWriteQueuesBusy(firstQueue, secondQueue)).toBe(false);
  });
});
