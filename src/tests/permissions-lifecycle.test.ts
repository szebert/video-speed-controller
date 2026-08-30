// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enqueuePermissionsReconcile,
  hasPermissionsReconcile,
  resetPermissionsReconcileQueue,
  schedulePermissionsReconcile,
} from '../background/permissions-lifecycle';

describe('permission reconciliation queue', () => {
  afterEach(() => {
    resetPermissionsReconcileQueue();
    vi.restoreAllMocks();
  });

  it('runs overlapping reconciles serially', async () => {
    let releaseFirst!: () => void;
    let firstStarted = false;
    const order: string[] = [];
    const first = enqueuePermissionsReconcile(async () => {
      firstStarted = true;
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push('first');
      return [];
    });
    await vi.waitUntil(() => firstStarted);
    const second = enqueuePermissionsReconcile(async () => {
      order.push('second');
      return [];
    });
    expect(order).toEqual([]);
    releaseFirst();
    await first;
    await second;
    expect(order).toEqual(['first', 'second']);
    await Promise.resolve();
    expect(hasPermissionsReconcile()).toBe(false);
  });

  it('does not poison the queue when a reconcile rejects', async () => {
    await expect(
      enqueuePermissionsReconcile(async () => {
        throw new Error('quota');
      }),
    ).rejects.toThrow(/quota/);
    await expect(enqueuePermissionsReconcile(async () => [])).resolves.toEqual([]);
  });

  it('consumes schedule rejections instead of leaving them unhandled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    schedulePermissionsReconcile('onInstalled', async () => {
      throw new Error('offline');
    });
    await vi.waitUntil(() => warn.mock.calls.length > 0);
    expect(warn).toHaveBeenCalledWith(
      'onInstalled permission reconciliation failed',
      expect.objectContaining({ message: 'offline' }),
    );
  });
});
