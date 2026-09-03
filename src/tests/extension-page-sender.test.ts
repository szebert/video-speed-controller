// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isExtensionPageSender } from '../background/extension-page-sender';

describe('isExtensionPageSender', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts the extension origin and rejects web content', () => {
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://extid${path}`,
      },
    });
    expect(isExtensionPageSender({ url: 'chrome-extension://extid/options.html' })).toBe(true);
    expect(isExtensionPageSender({ url: 'chrome-extension://extid/popup.html' })).toBe(true);
    expect(isExtensionPageSender({ url: 'https://example.com/' })).toBe(false);
    expect(isExtensionPageSender({})).toBe(false);
  });
});
