// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOverlayPositionFromSender } from '../background/set-overlay-position';
import { resetTabMutationQueue } from '../background/tab-mutation-queue';
import { OVERLAY_POSITION } from '../settings/site-behavior';
import { resetBehaviorDefaultsRepairBackoff } from '../storage/behavior-defaults';
import { resetSiteRepairBackoff, resolveSiteBehaviorForUrl } from '../storage/site-settings';
import { resetStorageMutationQueue } from '../storage/storage-mutation-queue';
import type { TabStateStore } from '../storage/tab-state';
import { memoryDurable } from './memory-store';
import { tabBehavior } from './tab-behavior-fixture';

function stores() {
  return {
    sync: memoryDurable(),
    local: memoryDurable(),
    now: () => 1_000,
  };
}

describe('setOverlayPositionFromSender', () => {
  beforeEach(() => {
    resetBehaviorDefaultsRepairBackoff();
    resetSiteRepairBackoff();
    resetStorageMutationQueue();
    resetTabMutationQueue();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists a site overlay position', async () => {
    const deps = {
      ...stores(),
      listTabIds: async () => [],
    };
    const result = await setOverlayPositionFromSender(
      { tab: { id: 4, url: 'https://www.youtube.com/watch' } as chrome.tabs.Tab },
      OVERLAY_POSITION.BOTTOM_RIGHT,
      deps,
    );
    expect(result).toEqual({ ok: true });
    const resolved = await resolveSiteBehaviorForUrl('https://www.youtube.com/watch', {
      ...deps,
      touchUsage: false,
    });
    expect(resolved?.overlayPosition).toEqual({
      value: OVERLAY_POSITION.BOTTOM_RIGHT,
      source: 'site',
    });
  });

  it('reports a reapply miss after a successful persist', async () => {
    const data: Record<string, unknown> = {
      'tab:4': tabBehavior(1.25),
    };
    const tabStateStore: TabStateStore = {
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
    const result = await setOverlayPositionFromSender(
      { tab: { id: 4, url: 'https://www.youtube.com/watch' } as chrome.tabs.Tab },
      OVERLAY_POSITION.BOTTOM_RIGHT,
      {
        ...stores(),
        tabStateStore,
        getTab: async () => ({ id: 4, url: 'https://www.youtube.com/watch' }) as chrome.tabs.Tab,
        apply: async () => {
          throw new Error('Receiving end does not exist');
        },
      },
    );
    expect(result).toEqual({
      ok: true,
      persistError: 'Failed to apply overlay position',
    });
  });

  it('rejects an unsupported tab', async () => {
    await expect(
      setOverlayPositionFromSender({ tab: { id: 1 } as chrome.tabs.Tab }, OVERLAY_POSITION.CENTER, {
        readTab: async () => ({}),
      }),
    ).resolves.toEqual({ ok: false, error: 'Unsupported tab' });
  });
});
