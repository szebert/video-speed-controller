// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSiteSpeedPersistCoalescer,
  SITE_SPEED_PERSIST_COALESCE_MS,
} from '../background/coalesce-site-speed';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('site speed persist coalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists the first speed immediately', async () => {
    const persist = vi.fn(async () => {});
    const coalescer = createSiteSpeedPersistCoalescer({ persist });
    await coalescer.persist('https://example.com/watch', 1.25);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('https://example.com/watch', 1.25);
    await vi.advanceTimersByTimeAsync(SITE_SPEED_PERSIST_COALESCE_MS);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('returns after apply-time persist and writes only the latest trailing speed', async () => {
    const persist = vi.fn(async () => {});
    const coalescer = createSiteSpeedPersistCoalescer({ persist });
    await coalescer.persist('https://example.com/watch', 1.25);
    const second = coalescer.persist('https://example.com/a', 1.5);
    const third = coalescer.persist('https://example.com/b', 1.75);
    await Promise.all([second, third]);
    expect(persist).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SITE_SPEED_PERSIST_COALESCE_MS);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith('https://example.com/b', 1.75);
  });

  it('does not persist again just because the leading write finished', async () => {
    const first = deferred<void>();
    const persist = vi.fn(async () => {
      if (persist.mock.calls.length === 1) {
        await first.promise;
      }
    });
    const coalescer = createSiteSpeedPersistCoalescer({ persist });
    const leading = coalescer.persist('https://example.com/watch', 1.25);
    await Promise.resolve();
    await Promise.resolve();
    const during = coalescer.persist('https://example.com/watch', 1.5);
    expect(persist).toHaveBeenCalledTimes(1);
    first.resolve();
    await Promise.all([leading, during]);
    expect(persist).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SITE_SPEED_PERSIST_COALESCE_MS - 1);
    expect(persist).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith('https://example.com/watch', 1.5);
  });

  it('persists once during a long continuous stream and once after it stops', async () => {
    const persist = vi.fn(async () => {});
    const coalescer = createSiteSpeedPersistCoalescer({ persist });
    await coalescer.persist('https://example.com/watch', 1);
    expect(persist).toHaveBeenCalledTimes(1);

    let speed = 1;
    for (let elapsed = 50; elapsed <= 3000; elapsed += 50) {
      await vi.advanceTimersByTimeAsync(50);
      speed = Number((1 + elapsed / 1000).toFixed(3));
      await coalescer.persist('https://example.com/watch', speed);
      expect(persist).toHaveBeenCalledTimes(1);
    }

    await vi.advanceTimersByTimeAsync(SITE_SPEED_PERSIST_COALESCE_MS - 1);
    expect(persist).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith('https://example.com/watch', speed);
  });

  it('leads independently for different hostnames', async () => {
    const persist = vi.fn(async () => {});
    const coalescer = createSiteSpeedPersistCoalescer({ persist });
    await coalescer.persist('https://www.youtube.com/watch', 1.25);
    await coalescer.persist('https://www.netflix.com/watch', 1.5);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls).toEqual([
      ['https://www.youtube.com/watch', 1.25],
      ['https://www.netflix.com/watch', 1.5],
    ]);
  });

  it('flushes a pending trailing persist immediately', async () => {
    const persist = vi.fn(async () => {});
    const coalescer = createSiteSpeedPersistCoalescer({ persist });
    await coalescer.persist('https://example.com/watch', 1.25);
    void coalescer.persist('https://example.com/watch', 2);
    await coalescer.flush();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith('https://example.com/watch', 2);
  });

  it('persists unsupported URLs immediately without coalescing', async () => {
    const persist = vi.fn(async () => {});
    const coalescer = createSiteSpeedPersistCoalescer({ persist });
    await coalescer.persist('https://example.com/watch', 1.25);
    await coalescer.persist('chrome://settings', 1.5);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith('chrome://settings', 1.5);
  });

  it('surfaces a leading persist failure', async () => {
    const persist = vi.fn(async () => {
      throw new Error('quota');
    });
    const coalescer = createSiteSpeedPersistCoalescer({ persist });
    await expect(coalescer.persist('https://example.com/watch', 1.25)).rejects.toThrow('quota');
  });

  it('does not persist a stale speed after a failed leading write and a newer burst', async () => {
    const first = deferred<void>();
    const persist = vi.fn(async (_url: string, speed: number) => {
      if (speed === 1.25) {
        await first.promise;
        throw new Error('quota');
      }
    });
    const coalescer = createSiteSpeedPersistCoalescer({ persist });
    const leading = coalescer.persist('https://example.com/a', 1.25);
    await Promise.resolve();
    await Promise.resolve();
    void coalescer.persist('https://example.com/b', 1.5);
    first.resolve();
    await expect(leading).rejects.toThrow('quota');
    await coalescer.persist('https://example.com/c', 1.75);
    await vi.advanceTimersByTimeAsync(SITE_SPEED_PERSIST_COALESCE_MS);
    await vi.runOnlyPendingTimersAsync();
    expect(persist.mock.calls.map(([, speed]) => speed)).toEqual([1.25, 1.75]);
  });
});
