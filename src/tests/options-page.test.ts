// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OPTIONS_PAGE_PATH,
  openExtensionOptionsPage,
  optionsPagePath,
  optionsPageUrl,
} from '../settings/options-page';

describe('options page URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds a normalized site query and omits invalid hostnames', () => {
    expect(optionsPagePath()).toBe(OPTIONS_PAGE_PATH);
    expect(optionsPagePath(null)).toBe(OPTIONS_PAGE_PATH);
    expect(optionsPagePath('Example.COM')).toBe(`${OPTIONS_PAGE_PATH}?site=example.com`);
    expect(optionsPagePath('example.com:8080')).toBe(OPTIONS_PAGE_PATH);
  });

  it('opens options.html with a site query from the extension origin', () => {
    const create = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://extid/${path}`,
      },
      tabs: { create },
    });
    expect(optionsPageUrl('www.youtube.com')).toBe(
      'chrome-extension://extid/options.html?site=www.youtube.com',
    );
    openExtensionOptionsPage('www.youtube.com');
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://extid/options.html?site=www.youtube.com',
    });
    openExtensionOptionsPage(null);
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://extid/options.html',
    });
  });
});
