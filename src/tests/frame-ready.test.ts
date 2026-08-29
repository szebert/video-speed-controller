// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { handleFrameReady } from '../background/frame-ready';
import type { TabStateStore } from '../storage/tab-state';

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
  it('does not overwrite an existing tabTarget from a later top-frame handshake', async () => {
    const tabStore = memoryTabStore();
    await tabStore.set({ 'tab:9': { targetSpeed: 2 } });

    vi.stubGlobal('chrome', {
      storage: { session: tabStore },
    });

    const response = await handleFrameReady({
      tab: { id: 9, url: 'https://youtube.com' } as chrome.tabs.Tab,
      frameId: 0,
      url: 'https://youtube.com',
    });

    expect(response).toEqual({ action: 'apply', targetSpeed: 2 });
    expect(tabStore.data['tab:9']).toEqual({ targetSpeed: 2 });
  });

  it('keeps child frames dormant when no tabTarget exists', async () => {
    vi.stubGlobal('chrome', {
      storage: { session: memoryTabStore() },
    });
    await expect(
      handleFrameReady({
        tab: { id: 4 } as chrome.tabs.Tab,
        frameId: 3,
        url: 'https://youtube.com/embed/1',
      }),
    ).resolves.toEqual({ action: 'dormant' });
  });
});
