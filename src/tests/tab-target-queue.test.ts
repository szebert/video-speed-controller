// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { enableSite } from '../background/enable-site';
import { handleFrameReady } from '../background/frame-ready';
import { adjustTabSpeed } from '../background/adjust-tab-speed';
import { setSpeed } from '../background/set-speed';
import { enqueueTabMutation, resetTabMutationQueue } from '../background/tab-mutation-queue';
import { clearTabState, type TabStateStore } from '../storage/tab-state';
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

describe('tab-target queue races', () => {
  beforeEach(() => {
    resetTabMutationQueue();
  });

  it('lets SET_SPEED win after a queued ENABLE_SITE apply', async () => {
    const tabStore = memoryTabStore();
    let releaseEnable!: () => void;
    const hold = new Promise<void>((resolve) => {
      releaseEnable = resolve;
    });
    const applied: number[] = [];
    const enable = enqueueTabMutation(1, () =>
      enableSite(1, 'https://www.youtube.com/watch', {
        tabStore,
        readBehavior: async () => tabBehavior(1),
        apply: async (_tabId, behavior) => {
          await hold;
          applied.push(behavior.targetSpeed);
        },
        ensure: async () => undefined,
      }),
    );
    const set = enqueueTabMutation(1, () =>
      setSpeed(1, 'https://www.youtube.com/watch', 1.25, {
        tabStore,
        persist: async () => undefined,
        apply: async (_tabId, behavior) => {
          applied.push(behavior.targetSpeed);
        },
        ensure: async () => undefined,
      }),
    );
    expect(applied).toEqual([]);
    releaseEnable();
    await enable;
    await set;
    expect(applied).toEqual([1, 1.25]);
    expect(tabStore.data['tab:1']).toEqual(tabBehavior(1.25));
  });

  it('lets SET_SPEED win after a queued FRAME_READY apply', async () => {
    const tabStore = memoryTabStore();
    let releaseReady!: () => void;
    const hold = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    const applied: number[] = [];
    const ready = enqueueTabMutation(4, () =>
      handleFrameReady(
        {
          tab: { id: 4, url: 'https://www.youtube.com/watch' } as chrome.tabs.Tab,
          frameId: 0,
          url: 'https://www.youtube.com/watch',
        },
        {
          tabStore,
          readBehavior: async () => tabBehavior(1),
          apply: async (_tabId, behavior) => {
            await hold;
            applied.push(behavior.targetSpeed);
          },
        },
      ),
    );
    const set = enqueueTabMutation(4, () =>
      setSpeed(4, 'https://www.youtube.com/watch', 1.25, {
        tabStore,
        persist: async () => undefined,
        apply: async (_tabId, behavior) => {
          applied.push(behavior.targetSpeed);
        },
        ensure: async () => undefined,
      }),
    );
    releaseReady();
    await ready;
    await set;
    expect(applied).toEqual([1, 1.25]);
    expect(tabStore.data['tab:4']).toEqual(tabBehavior(1.25));
  });

  it('clears the tab target after an in-flight SET_SPEED', async () => {
    const tabStore = memoryTabStore();
    let releaseSet!: () => void;
    const hold = new Promise<void>((resolve) => {
      releaseSet = resolve;
    });
    const set = enqueueTabMutation(2, () =>
      setSpeed(2, 'https://www.youtube.com/watch', 1.25, {
        tabStore,
        persist: async () => undefined,
        readOverlay: async () => tabBehavior(1),
        apply: async () => {
          await hold;
        },
        ensure: async () => undefined,
      }),
    );
    const clear = enqueueTabMutation(2, () => clearTabState(2, tabStore));
    releaseSet();
    await set;
    await clear;
    expect(tabStore.data['tab:2']).toBeUndefined();
  });

  it('serializes rapid ADJUST_SPEED +1 clicks from 1.00 to 1.50', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:8': tabBehavior(1) });
    let releaseFirst!: () => void;
    const hold = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const applied: number[] = [];
    const sender = {
      tab: { id: 8, url: 'https://www.youtube.com/watch' } as chrome.tabs.Tab,
    };
    const first = enqueueTabMutation(8, () =>
      adjustTabSpeed(sender, 1, {
        tabStore,
        persist: async () => undefined,
        apply: async (_tabId, behavior) => {
          await hold;
          applied.push(behavior.targetSpeed);
        },
        ensure: async () => undefined,
      }),
    );
    const second = enqueueTabMutation(8, () =>
      adjustTabSpeed(sender, 1, {
        tabStore,
        persist: async () => undefined,
        apply: async (_tabId, behavior) => {
          applied.push(behavior.targetSpeed);
        },
        ensure: async () => undefined,
      }),
    );
    releaseFirst();
    await first;
    await second;
    expect(applied).toEqual([1.25, 1.5]);
    expect(tabStore.data['tab:8']).toEqual(tabBehavior(1.5));
  });
});
