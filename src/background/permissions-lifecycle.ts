// SPDX-License-Identifier: GPL-3.0-only

import { reconcileContentScripts } from '../access/content-registration';
import { selectHttpHttpsHostPatterns, type HostPattern } from '../access/site-access';
import { createKeyedMutationQueue } from '../storage/keyed-mutation-queue';
import { broadcastReconcileAccess } from './broadcast';

export const PERMISSIONS_RECONCILE_LOCK = 'permissions:reconcile';

const permissionReconcile = createKeyedMutationQueue<string>();

export async function onPermissionsChanged(): Promise<HostPattern[]> {
  const all = await chrome.permissions.getAll();
  const allowedHostPatterns = selectHttpHttpsHostPatterns(all.origins ?? []);
  await reconcileContentScripts(all.origins ?? []);
  await broadcastReconcileAccess(allowedHostPatterns);
  return allowedHostPatterns;
}

export function enqueuePermissionsReconcile(
  reconcile: () => Promise<HostPattern[]> = onPermissionsChanged,
): Promise<HostPattern[]> {
  return permissionReconcile.enqueue(PERMISSIONS_RECONCILE_LOCK, reconcile);
}

export function schedulePermissionsReconcile(
  label: string,
  reconcile: () => Promise<HostPattern[]> = onPermissionsChanged,
): void {
  void enqueuePermissionsReconcile(reconcile).catch((error) => {
    console.warn(`${label} permission reconciliation failed`, error);
  });
}

export function resetPermissionsReconcileQueue(): void {
  permissionReconcile.reset();
}

export function hasPermissionsReconcile(): boolean {
  return permissionReconcile.has(PERMISSIONS_RECONCILE_LOCK);
}
