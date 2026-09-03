// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { openOptionsFromSender } from '../background/open-options-from-sender';

describe('openOptionsFromSender', () => {
  it('opens the current site options page', async () => {
    const openPage = vi.fn();
    await expect(
      openOptionsFromSender(
        { tab: { id: 3, url: 'https://www.youtube.com/watch' } as chrome.tabs.Tab },
        { openPage },
      ),
    ).resolves.toEqual({ ok: true });
    expect(openPage).toHaveBeenCalledWith('www.youtube.com');
  });

  it('opens options without a site when the tab URL is unsupported', async () => {
    const openPage = vi.fn();
    await expect(
      openOptionsFromSender(
        { tab: { id: 3 } as chrome.tabs.Tab },
        {
          readTab: async () => ({}),
          openPage,
        },
      ),
    ).resolves.toEqual({ ok: true });
    expect(openPage).toHaveBeenCalledWith(null);
  });
});
