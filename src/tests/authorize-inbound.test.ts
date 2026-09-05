// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeBackgroundInbound } from '../background/authorize-inbound';
import { inboundChannel } from '../protocol/schemas/background-inbound';

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
    expect(
      authorizeBackgroundInbound(
        inboundChannel('SET_BEHAVIOR_SETTING'),
        'SET_BEHAVIOR_SETTING',
        tabSender,
      ),
    ).toBe('unauthorized');
    expect(
      authorizeBackgroundInbound(inboundChannel('GET_POPUP_STATE'), 'GET_POPUP_STATE', tabSender),
    ).toBe('ignore');
  });

  it('allows FRAME_READY from a tab sender', () => {
    expect(
      authorizeBackgroundInbound(inboundChannel('FRAME_READY'), 'FRAME_READY', {
        url: 'https://example.com/',
        tab: { id: 1 },
      } as chrome.runtime.MessageSender),
    ).toBe('allow');
  });

  it('ignores content commands from extension pages and tabless senders', () => {
    const extensionPage = { url: `${EXTENSION_ORIGIN}/options.html` };
    expect(
      authorizeBackgroundInbound(inboundChannel('FRAME_READY'), 'FRAME_READY', extensionPage),
    ).toBe('ignore');
    expect(
      authorizeBackgroundInbound(
        inboundChannel('OPEN_OPTIONS_PAGE'),
        'OPEN_OPTIONS_PAGE',
        extensionPage,
      ),
    ).toBe('ignore');
    expect(
      authorizeBackgroundInbound(inboundChannel('ADJUST_SPEED'), 'ADJUST_SPEED', extensionPage),
    ).toBe('ignore');
    expect(
      authorizeBackgroundInbound(inboundChannel('FRAME_READY'), 'FRAME_READY', {
        url: 'https://example.com/',
      } as chrome.runtime.MessageSender),
    ).toBe('ignore');
  });
});
