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

  it('keeps one persist in flight and then writes the latest pending value', async () => {
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
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith('https://example.com/watch', 1.5);
  });

  it('does not collapse different hostnames', async () => {
    const persist = vi.fn(async () => {});
    const coalescer = createSiteSpeedPersistCoalescer({ persist });
    await coalescer.persist('https://www.youtube.com/watch', 1.25);
    await coalescer.persist('https://www.netflix.com/watch', 1.5);
    expect(persist).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SITE_SPEED_PERSIST_COALESCE_MS);
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
});
