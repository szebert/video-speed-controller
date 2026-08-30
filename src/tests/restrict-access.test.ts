// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { restrictStorageAccess } from '../storage/restrict-access';

describe('restrictStorageAccess', () => {
  it('restricts Sync and Local to trusted contexts', async () => {
    const sync = { setAccessLevel: vi.fn(async () => undefined) };
    const local = { setAccessLevel: vi.fn(async () => undefined) };
    await restrictStorageAccess(sync, local);
    expect(sync.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
    expect(local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
  });
});
