// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTabBehavior } from '../background/broadcast';
import { reapplyBehaviorSettings } from '../background/reapply-behavior-settings';
import { enqueueTabMutation, resetTabMutationQueue } from '../background/tab-mutation-queue';
import { OVERLAY_POSITION } from '../settings/site-behavior';
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

function tab(id: number, url: string): chrome.tabs.Tab {
  return { id, url } as chrome.tabs.Tab;
}

describe('reapplyBehaviorSettings', () => {
  beforeEach(() => {
    resetTabMutationQueue();
  });

  it('does not apply a global speed change', async () => {
    const queryTabs = vi.fn(async () => [tab(1, 'https://www.youtube.com/watch')]);
    const apply = vi.fn();
    const result = await reapplyBehaviorSettings(
      { scope: { kind: 'global' }, change: { kind: 'value', field: 'speed', value: 1.5 } },
      { queryTabs, apply },
    );
    expect(result).toEqual({ reappliedTabs: 0, reapplyFailures: 0 });
    expect(queryTabs).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('merges presentation fields onto the current tab speed', async () => {
    const store = memoryTabStore();
    await store.set({
      'tab:1': tabBehavior(1.25, { overlayPosition: OVERLAY_POSITION.TOP_CENTER }),
    });
    const apply = vi.fn();
    const result = await reapplyBehaviorSettings(
      {
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayPosition', value: OVERLAY_POSITION.BOTTOM_RIGHT },
      },
      {
        queryTabs: async () => [tab(1, 'https://www.youtube.com/watch')],
        getTab: async () => tab(1, 'https://www.youtube.com/watch'),
        tabStateStore: store,
        readBehavior: async () =>
          tabBehavior(1, { overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT }),
        apply,
        enqueue: enqueueTabMutation,
      },
    );
    expect(result).toEqual({ reappliedTabs: 1, reapplyFailures: 0 });
    expect(store.data['tab:1']).toEqual(
      tabBehavior(1.25, { overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT }),
    );
    expect(apply).toHaveBeenCalledWith(
      1,
      tabBehavior(1.25, { overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT }),
      undefined,
      { ignoreNoReceiver: false },
    );
  });

  it('retargets matching site-speed tabs with the fully resolved behavior', async () => {
    const store = memoryTabStore();
    await store.set({
      'tab:1': tabBehavior(1.25, { overlayPosition: OVERLAY_POSITION.BOTTOM_LEFT }),
      'tab:2': tabBehavior(1.25),
    });
    const apply = vi.fn();
    const result = await reapplyBehaviorSettings(
      {
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        change: { kind: 'inherit', field: 'speed' },
      },
      {
        queryTabs: async () => [
          tab(1, 'https://www.youtube.com/watch'),
          tab(2, 'https://vimeo.com/1'),
        ],
        getTab: async (id) =>
          id === 1 ? tab(1, 'https://www.youtube.com/watch') : tab(2, 'https://vimeo.com/1'),
        tabStateStore: store,
        readBehavior: async (url) =>
          url.includes('youtube')
            ? tabBehavior(1.5, { overlayPosition: OVERLAY_POSITION.BOTTOM_LEFT })
            : tabBehavior(2),
        apply,
        enqueue: enqueueTabMutation,
      },
    );
    expect(result).toEqual({ reappliedTabs: 1, reapplyFailures: 0 });
    expect(store.data['tab:1']).toEqual(
      tabBehavior(1.5, { overlayPosition: OVERLAY_POSITION.BOTTOM_LEFT }),
    );
    expect(store.data['tab:2']).toEqual(tabBehavior(1.25));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('retargets when a site max speed change clamps the current tab', async () => {
    const store = memoryTabStore();
    await store.set({ 'tab:1': tabBehavior(4) });
    const apply = vi.fn();
    const result = await reapplyBehaviorSettings(
      {
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        change: { kind: 'value', field: 'speedMax', value: 2 },
      },
      {
        queryTabs: async () => [tab(1, 'https://www.youtube.com/watch')],
        getTab: async () => tab(1, 'https://www.youtube.com/watch'),
        tabStateStore: store,
        readBehavior: async () => tabBehavior(2, { speedMax: 2 }),
        apply,
        enqueue: enqueueTabMutation,
      },
    );
    expect(result).toEqual({ reappliedTabs: 1, reapplyFailures: 0 });
    expect(store.data['tab:1']).toEqual(tabBehavior(2, { speedMax: 2 }));
  });

  it('uses the current tabs.get URL rather than the discovery-time URL', async () => {
    const store = memoryTabStore();
    await store.set({ 'tab:1': tabBehavior(1.25) });
    const apply = vi.fn();
    const result = await reapplyBehaviorSettings(
      {
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        change: { kind: 'value', field: 'overlayPosition', value: OVERLAY_POSITION.BOTTOM_RIGHT },
      },
      {
        queryTabs: async () => [tab(1, 'https://vimeo.com/stale')],
        getTab: async () => tab(1, 'https://www.youtube.com/watch'),
        tabStateStore: store,
        readBehavior: async (url, options) => {
          expect(options).toEqual({ touchUsage: false });
          expect(url).toBe('https://www.youtube.com/watch');
          return tabBehavior(1, { overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT });
        },
        apply,
        enqueue: enqueueTabMutation,
      },
    );
    expect(result).toEqual({ reappliedTabs: 1, reapplyFailures: 0 });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('counts only successful applies and rolls back session state on a strict no-receiver', async () => {
    const store = memoryTabStore();
    const previous = tabBehavior(1.25);
    await store.set({ 'tab:1': previous });
    const result = await reapplyBehaviorSettings(
      {
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayAutoHide', value: false },
      },
      {
        queryTabs: async () => [tab(1, 'https://www.youtube.com/watch')],
        getTab: async () => tab(1, 'https://www.youtube.com/watch'),
        tabStateStore: store,
        readBehavior: async () => tabBehavior(1, { overlayAutoHide: false }),
        apply: applyTabBehavior,
        tabs: {
          query: async () => [],
          sendMessage: async () => {
            throw new Error('Receiving end does not exist');
          },
        },
        enqueue: enqueueTabMutation,
      },
    );
    expect(result).toEqual({ reappliedTabs: 0, reapplyFailures: 1 });
    expect(store.data['tab:1']).toEqual(previous);
  });

  it('increments reapplyFailures when resolve throws and leaves session state intact', async () => {
    const store = memoryTabStore();
    const previous = tabBehavior(1.25);
    await store.set({ 'tab:1': previous });
    const result = await reapplyBehaviorSettings(
      {
        scope: { kind: 'site', hostname: 'www.youtube.com' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
      },
      {
        queryTabs: async () => [tab(1, 'https://www.youtube.com/watch')],
        getTab: async () => tab(1, 'https://www.youtube.com/watch'),
        tabStateStore: store,
        readBehavior: async () => {
          throw new Error('resolve failed');
        },
        apply: vi.fn(),
        enqueue: enqueueTabMutation,
      },
    );
    expect(result).toEqual({ reappliedTabs: 0, reapplyFailures: 1 });
    expect(store.data['tab:1']).toEqual(previous);
  });

  it('surfaces query failure as reapplyError without counting phantom tabs', async () => {
    const result = await reapplyBehaviorSettings(
      {
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayPosition', value: OVERLAY_POSITION.BOTTOM_LEFT },
      },
      {
        queryTabs: async () => {
          throw new Error('tabs.query failed');
        },
      },
    );
    expect(result).toEqual({
      reappliedTabs: 0,
      reapplyFailures: 0,
      reapplyError: 'tabs.query failed',
    });
  });

  it('finishes two queued presentation writes as the last write', async () => {
    const store = memoryTabStore();
    await store.set({ 'tab:1': tabBehavior(1.25) });
    let latest = tabBehavior(1, { overlayPosition: OVERLAY_POSITION.BOTTOM_LEFT });
    const apply = vi.fn();
    const first = reapplyBehaviorSettings(
      {
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayPosition', value: OVERLAY_POSITION.BOTTOM_LEFT },
      },
      {
        queryTabs: async () => [tab(1, 'https://www.youtube.com/watch')],
        getTab: async () => tab(1, 'https://www.youtube.com/watch'),
        tabStateStore: store,
        readBehavior: async () => latest,
        apply,
        enqueue: enqueueTabMutation,
      },
    );
    latest = tabBehavior(1, { overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT });
    const second = reapplyBehaviorSettings(
      {
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayPosition', value: OVERLAY_POSITION.BOTTOM_RIGHT },
      },
      {
        queryTabs: async () => [tab(1, 'https://www.youtube.com/watch')],
        getTab: async () => tab(1, 'https://www.youtube.com/watch'),
        tabStateStore: store,
        readBehavior: async () => latest,
        apply,
        enqueue: enqueueTabMutation,
      },
    );
    await Promise.all([first, second]);
    expect(store.data['tab:1']).toEqual(
      tabBehavior(1.25, { overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT }),
    );
  });

  it('retargets every controlled tab when resetting all settings', async () => {
    const store = memoryTabStore();
    await store.set({
      'tab:1': tabBehavior(1.25),
      'tab:2': tabBehavior(1.5, { overlayVisible: false }),
    });
    const apply = vi.fn();
    const result = await reapplyBehaviorSettings(
      { scope: { kind: 'all' }, change: { kind: 'inherit', field: 'speed' } },
      {
        queryTabs: async () => [
          tab(1, 'https://www.youtube.com/watch'),
          tab(2, 'https://vimeo.com/1'),
        ],
        getTab: async (id) =>
          id === 1 ? tab(1, 'https://www.youtube.com/watch') : tab(2, 'https://vimeo.com/1'),
        tabStateStore: store,
        readBehavior: async () => tabBehavior(1),
        apply,
        enqueue: enqueueTabMutation,
      },
    );
    expect(result).toEqual({ reappliedTabs: 2, reapplyFailures: 0 });
    expect(store.data['tab:1']).toEqual(tabBehavior(1));
    expect(store.data['tab:2']).toEqual(tabBehavior(1));
    expect(apply).toHaveBeenCalledTimes(2);
  });
});
