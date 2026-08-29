// SPDX-License-Identifier: GPL-3.0-only

import { reconcileContentScripts } from '../access/content-registration';
import { selectHttpHttpsHostPatterns, type HostPattern } from '../access/site-access';
import { broadcastReconcileAccess } from './broadcast';

export async function onPermissionsChanged(): Promise<HostPattern[]> {
  const all = await chrome.permissions.getAll();
  const allowedHostPatterns = selectHttpHttpsHostPatterns(all.origins ?? []);
  await reconcileContentScripts(all.origins ?? []);
  await broadcastReconcileAccess(allowedHostPatterns);
  return allowedHostPatterns;
}
