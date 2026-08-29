// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { requestExactOriginAccess } from '../access/site-access';

describe('permission request stays on the popup gesture path', () => {
  it('calls permissions.request immediately with the exact origin pattern', async () => {
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

    const granted = await requestExactOriginAccess('https://max.com/watch');
    expect(granted).toBe(true);
    expect(order).toEqual(['request']);
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://max.com:443/*'],
    });
  });
});
