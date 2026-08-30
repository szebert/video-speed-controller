// SPDX-License-Identifier: GPL-3.0-only

export type AccessLevelArea = {
  setAccessLevel: (accessOptions: { accessLevel: 'TRUSTED_CONTEXTS' }) => Promise<void>;
};

export async function restrictStorageAccess(
  sync: AccessLevelArea = chrome.storage.sync,
  local: AccessLevelArea = chrome.storage.local,
): Promise<void> {
  await Promise.all([
    sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
}
