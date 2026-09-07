// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reapplyHotkeysToTabs } from '../background/reapply-hotkeys';
import { enqueueTabMutation, resetTabMutationQueue } from '../background/tab-mutation-queue';
import { builtInEffectiveHotkeys } from '../settings/hotkey-binding';
import type { TabStateStore } from '../storage/tab-state';
import { tabBehavior } from './tab-behavior-fixture';

function memoryTabStore(): TabStateStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
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

describe('reapplyHotkeysToTabs', () => {
  beforeEach(() => {
    resetTabMutationQueue();
  });

  it('applies the previous session behavior plus a fresh map and does not rewrite tab state', async () => {
    const store = memoryTabStore();
    const previous = tabBehavior(1.25);
    await store.set({ 'tab:1': previous });
    const apply = vi.fn();
    const set = vi.spyOn(store, 'set');
    const hotkeys = {
      ...builtInEffectiveHotkeys(),
      resetSpeed: null,
    };
    const result = await reapplyHotkeysToTabs(
      { kind: 'global' },
      {
        getTab: async () => ({ id: 1, url: 'https://www.youtube.com/watch' }) as chrome.tabs.Tab,
        tabStateStore: store,
        getTabState: async () => previous,
        readPayload: async () => ({ behavior: tabBehavior(1), hotkeys }),
        apply,
        enqueue: enqueueTabMutation,
      },
    );
    expect(result).toEqual({ reappliedTabs: 1, reapplyFailures: 0 });
    expect(store.data['tab:1']).toEqual(previous);
    expect(set).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(1, previous, undefined, {
      ignoreNoReceiver: false,
      hotkeys,
    });
  });
});
