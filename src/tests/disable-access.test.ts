// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { disableExactOriginAccess } from '../access/site-access';

describe('Disable verifies actual Chrome access', () => {
  it('treats an exact grant removal as disabled', async () => {
    vi.stubGlobal('chrome', {
      permissions: {
        remove: vi.fn(async () => true),
        contains: vi.fn(async () => false),
      },
    });

    await expect(disableExactOriginAccess('https://reddit.com/r/videos')).resolves.toEqual({
      disabled: true,
      broaderGrant: false,
    });
    expect(chrome.permissions.remove).toHaveBeenCalledWith({
      origins: ['https://reddit.com:443/*'],
    });
  });

  it('keeps access on when a covering grant still contains the site', async () => {
    vi.stubGlobal('chrome', {
      permissions: {
        remove: vi.fn(async () => false),
        contains: vi.fn(async () => true),
      },
    });

    await expect(disableExactOriginAccess('https://reddit.com/r/videos')).resolves.toEqual({
      disabled: false,
      broaderGrant: true,
    });
  });
});
