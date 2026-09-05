// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeBackgroundInbound } from '../background/authorize-inbound';

const EXTENSION_ORIGIN = 'chrome-extension://extid';

describe('authorizeBackgroundInbound', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `${EXTENSION_ORIGIN}${path === '/' ? '/' : path}`,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a tab sender for options and popup commands', () => {
    const tabSender = {
      url: 'https://example.com/',
      tab: { id: 1 },
    } as chrome.runtime.MessageSender;
    expect(authorizeBackgroundInbound('options', 'SET_BEHAVIOR_SETTING', tabSender)).toBe(
      'unauthorized',
    );
    expect(authorizeBackgroundInbound('popup', 'GET_POPUP_STATE', tabSender)).toBe('ignore');
  });

  it('allows FRAME_READY from a tab sender', () => {
    expect(
      authorizeBackgroundInbound('content', 'FRAME_READY', {
        url: 'https://example.com/',
        tab: { id: 1 },
      } as chrome.runtime.MessageSender),
    ).toBe('allow');
  });

  it('ignores content commands from extension pages and tabless senders', () => {
    const extensionPage = { url: `${EXTENSION_ORIGIN}/options.html` };
    expect(authorizeBackgroundInbound('content', 'FRAME_READY', extensionPage)).toBe('ignore');
    expect(authorizeBackgroundInbound('content', 'OPEN_OPTIONS_PAGE', extensionPage)).toBe(
      'ignore',
    );
    expect(authorizeBackgroundInbound('content', 'ADJUST_SPEED', extensionPage)).toBe('ignore');
    expect(
      authorizeBackgroundInbound('content', 'FRAME_READY', {
        url: 'https://example.com/',
      } as chrome.runtime.MessageSender),
    ).toBe('ignore');
  });
});
