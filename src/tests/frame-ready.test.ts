// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { handleFrameReady } from '../background/frame-ready';
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

describe('FRAME_READY', () => {
  it('does not overwrite an existing full tab state from a later top-frame handshake', async () => {
    const tabStore = memoryTabStore();
    const existing = tabBehavior(2);
    await tabStore.set({ 'tab:9': existing });
    const apply = vi.fn();
    const response = await handleFrameReady(
      {
        tab: { id: 9, url: 'https://youtube.com' } as chrome.tabs.Tab,
        frameId: 0,
        url: 'https://youtube.com',
      },
      { tabStore, apply, readBehavior: async () => tabBehavior(1) },
    );

    expect(response).toEqual({ action: 'applied' });
    expect(apply).toHaveBeenCalledWith(9, existing);
    expect(tabStore.data['tab:9']).toEqual(existing);
  });

  it('seeds full behavior for a top-frame handshake', async () => {
    const tabStore = memoryTabStore();
    const seeded = tabBehavior(1.25);
    const apply = vi.fn();
    const response = await handleFrameReady(
      {
        tab: { id: 3, url: 'https://www.youtube.com/watch' } as chrome.tabs.Tab,
        frameId: 0,
        url: 'https://www.youtube.com/watch',
      },
      { tabStore, apply, readBehavior: async () => seeded },
    );
    expect(response).toEqual({ action: 'applied' });
    expect(apply).toHaveBeenCalledWith(3, seeded);
    expect(tabStore.data['tab:3']).toEqual(seeded);
  });

  it('keeps child frames dormant when no tabTarget exists', async () => {
    await expect(
      handleFrameReady(
        {
          tab: { id: 4 } as chrome.tabs.Tab,
          frameId: 3,
          url: 'https://youtube.com/embed/1',
        },
        { tabStore: memoryTabStore(), apply: vi.fn() },
      ),
    ).resolves.toEqual({ action: 'dormant' });
  });

  it('clears a provisional tab target when top-frame apply throws', async () => {
    const tabStore = memoryTabStore();
    await expect(
      handleFrameReady(
        {
          tab: { id: 3, url: 'https://www.youtube.com/watch' } as chrome.tabs.Tab,
          frameId: 0,
          url: 'https://www.youtube.com/watch',
        },
        {
          tabStore,
          readBehavior: async () => tabBehavior(1.25),
          apply: async () => {
            throw new Error('send failed');
          },
        },
      ),
    ).rejects.toThrow(/send failed/);
    expect(tabStore.data['tab:3']).toBeUndefined();
  });
});
