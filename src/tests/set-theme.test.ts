// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTheme } from '../background/set-theme';
import { resetStorageMutationQueue } from '../storage/storage-mutation-queue';
import { memoryDurable } from './memory-store';

const EXTENSION_ORIGIN = 'chrome-extension://extid';

describe('setTheme', () => {
  beforeEach(() => {
    resetStorageMutationQueue();
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `${EXTENSION_ORIGIN}${path === '/' ? '/' : path}`,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists theme from an extension-page sender', async () => {
    const sync = memoryDurable();
    const response = await setTheme(
      { type: 'SET_THEME', preference: 'light' },
      { url: `${EXTENSION_ORIGIN}/popup.html` },
      { sync },
    );
    expect(response).toEqual({ ok: true });
    expect(sync.data['pref:theme']).toMatchObject({ preference: 'light' });
  });

  it('rejects a tab sender', async () => {
    const sync = memoryDurable();
    const response = await setTheme(
      { type: 'SET_THEME', preference: 'light' },
      { url: 'https://example.com/', tab: { id: 1 } } as chrome.runtime.MessageSender,
      { sync },
    );
    expect(response).toEqual({ ok: false, error: 'Unauthorized' });
    expect(sync.data['pref:theme']).toBeUndefined();
  });
});
