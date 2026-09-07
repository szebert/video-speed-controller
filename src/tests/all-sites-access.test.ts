// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import {
  ALL_SITE_ORIGINS,
  containsAllSitesAccess,
  removeAllSitesAccess,
  requestAllSitesAccess,
} from '../access/site-access';

describe('all-sites optional host access', () => {
  it('calls permissions.request immediately with both wildcard origins', async () => {
    const order: string[] = [];
    vi.stubGlobal('chrome', {
      permissions: {
        request: vi.fn(async () => {
          order.push('request');
          return true;
        }),
      },
      runtime: {
        sendMessage: vi.fn(async () => {
          order.push('message');
          return {};
        }),
      },
    });

    const granted = await requestAllSitesAccess();
    expect(granted).toBe(true);
    expect(order).toEqual(['request']);
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: [...ALL_SITE_ORIGINS],
    });
  });

  it('contains and removes both wildcard origins', async () => {
    vi.stubGlobal('chrome', {
      permissions: {
        contains: vi.fn(async () => true),
        remove: vi.fn(async () => true),
      },
    });

    await expect(containsAllSitesAccess()).resolves.toBe(true);
    await expect(removeAllSitesAccess()).resolves.toBe(true);
    expect(chrome.permissions.contains).toHaveBeenCalledWith({
      origins: [...ALL_SITE_ORIGINS],
    });
    expect(chrome.permissions.remove).toHaveBeenCalledWith({
      origins: [...ALL_SITE_ORIGINS],
    });
  });
});
