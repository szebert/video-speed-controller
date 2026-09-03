// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { resolvePopupTargetTab } from '../access/popup-target-tab';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';

describe('resolvePopupTargetTab', () => {
  it('keeps an unsupported active tab so chrome:// stays unavailable', () => {
    const settings = { id: 2, url: 'chrome://settings' };
    expect(
      resolvePopupTargetTab(
        settings,
        [settings, { id: 3, url: 'https://youtube.com/', lastAccessed: 9 }],
        extensionId,
      ),
    ).toEqual(settings);
  });

  it('keeps the options page so it stays unavailable instead of the last http(s) tab', () => {
    const options = { id: 2, url: `chrome-extension://${extensionId}/options.html` };
    const youtube = { id: 3, url: 'https://youtube.com/', lastAccessed: 9 };
    expect(resolvePopupTargetTab(options, [options, youtube], extensionId)).toEqual(options);
  });

  it('keeps a site-scoped options page so it stays unavailable', () => {
    const options = {
      id: 2,
      url: `chrome-extension://${extensionId}/options.html?site=www.youtube.com`,
    };
    const youtube = { id: 3, url: 'https://youtube.com/', lastAccessed: 9 };
    expect(resolvePopupTargetTab(options, [options, youtube], extensionId)).toEqual(options);
  });

  it('falls back from the popup tab itself to the latest http(s) tab', () => {
    const popup = { id: 1, url: `chrome-extension://${extensionId}/popup.html` };
    const older = { id: 3, url: 'http://127.0.0.1:4173/multi-video.html', lastAccessed: 1 };
    const newer = { id: 4, url: 'http://127.0.0.1:4173/shadow.html', lastAccessed: 5 };
    expect(resolvePopupTargetTab(popup, [popup, older, newer], extensionId)).toEqual(newer);
  });

  it('uses an injected e2e target when tab URLs are hidden from query', () => {
    const popup = { id: 1, url: `chrome-extension://${extensionId}/popup.html` };
    expect(
      resolvePopupTargetTab(popup, [popup, { id: 9 }], extensionId, {
        tabId: 9,
        url: 'http://127.0.0.1:4173/multi-video.html',
      }),
    ).toEqual({ id: 9, url: 'http://127.0.0.1:4173/multi-video.html' });
  });

  it('does not treat a URL-less active tab as the site when the popup is itself a tab', () => {
    const popupTab = { id: 1 };
    expect(
      resolvePopupTargetTab(
        popupTab,
        [popupTab, { id: 9 }],
        extensionId,
        {
          tabId: 9,
          url: 'http://127.0.0.1:4173/multi-video.html',
        },
        1,
      ),
    ).toEqual({ id: 9, url: 'http://127.0.0.1:4173/multi-video.html' });
  });

  it('keeps a URL-less toolbar-popup active tab so chrome:// does not steal another site', () => {
    const chromeTab = { id: 2 };
    const youtube = { id: 3, url: 'https://youtube.com/', lastAccessed: 9 };
    expect(resolvePopupTargetTab(chromeTab, [chromeTab, youtube], extensionId)).toEqual(chromeTab);
  });

  it('uses an injected e2e target for unsupported chrome:// pages', () => {
    const popupTab = { id: 1 };
    expect(
      resolvePopupTargetTab(
        popupTab,
        [popupTab],
        extensionId,
        {
          tabId: 4,
          url: 'chrome://version/',
        },
        1,
      ),
    ).toEqual({ id: 4, url: 'chrome://version/' });
  });
});
