// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { enqueueTabMutation, resetTabMutationQueue } from '../background/tab-mutation-queue';

describe('enqueueTabMutation', () => {
  it('runs later mutations for the same tab only after the earlier one settles', async () => {
    resetTabMutationQueue();
    let release!: (value: string) => void;
    const held = new Promise<string>((resolve) => {
      release = resolve;
    });
    const first = enqueueTabMutation(4, () => held);
    const order: string[] = [];
    const second = enqueueTabMutation(4, async () => {
      order.push('second');
      return 'reset';
    });
    expect(order).toEqual([]);
    release('set');
    await expect(first).resolves.toBe('set');
    await expect(second).resolves.toBe('reset');
    expect(order).toEqual(['second']);
  });

  it('does not block a different tab', async () => {
    resetTabMutationQueue();
    let release!: (value: string) => void;
    const held = new Promise<string>((resolve) => {
      release = resolve;
    });
    const blocked = enqueueTabMutation(1, () => held);
    const other = enqueueTabMutation(2, async () => 'other');
    await expect(other).resolves.toBe('other');
    release('done');
    await expect(blocked).resolves.toBe('done');
  });
});
