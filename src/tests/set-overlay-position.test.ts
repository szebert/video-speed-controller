// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOverlayPositionFromSender } from '../background/set-overlay-position';
import { resetTabMutationQueue } from '../background/tab-mutation-queue';
import { OVERLAY_POSITION } from '../settings/site-behavior';
import { resetBehaviorDefaultsRepairBackoff } from '../storage/behavior-defaults';
import { resetSiteRepairBackoff, resolveSiteBehaviorForUrl } from '../storage/site-settings';
import { resetStorageMutationQueue } from '../storage/storage-mutation-queue';
import { memoryDurable } from './memory-store';

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
      queryTabs: async () => [],
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

  it('rejects an unsupported tab', async () => {
    await expect(
      setOverlayPositionFromSender({ tab: { id: 1 } as chrome.tabs.Tab }, OVERLAY_POSITION.CENTER, {
        readTab: async () => ({}),
      }),
    ).resolves.toEqual({ ok: false, error: 'Unsupported tab' });
  });
});
