// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { listTargetedTabIds, tabIdFromKey, type TabStateStore } from '../storage/tab-state';

function memoryTabStore(data: Record<string, unknown> = {}): TabStateStore {
  return {
    async get(keys) {
      if (typeof keys === 'string') {
        return { [keys]: data[keys] };
      }
      return { ...data };
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) {
        delete data[key];
      }
    },
  };
}

describe('tabIdFromKey', () => {
  it('accepts canonical non-negative decimal tab keys', () => {
    expect(tabIdFromKey('tab:0')).toBe(0);
    expect(tabIdFromKey('tab:1')).toBe(1);
    expect(tabIdFromKey('tab:123')).toBe(123);
  });

  it('rejects loose or oversized tab keys', () => {
    expect(tabIdFromKey('tab:-1')).toBeNull();
    expect(tabIdFromKey('tab:01')).toBeNull();
    expect(tabIdFromKey('tab:1a')).toBeNull();
    expect(tabIdFromKey('tab:')).toBeNull();
    expect(tabIdFromKey('foo')).toBeNull();
    expect(tabIdFromKey('tab:999999999999999999999999')).toBeNull();
  });
});

describe('listTargetedTabIds', () => {
  it('ignores popup e2e keys and padded tab ids', async () => {
    const store = memoryTabStore({
      'tab:0': { targetSpeed: 1 },
      'tab:2': { targetSpeed: 1.25 },
      'tab:01': { targetSpeed: 2 },
      'e2e:popup-target-url': 'https://www.youtube.com/watch',
      'e2e:popup-target-tab-id': 9,
    });
    await expect(listTargetedTabIds(store)).resolves.toEqual([0, 2]);
  });
});
