// SPDX-License-Identifier: GPL-3.0-only

import { isAppliedTabBehavior, type AppliedTabBehavior } from '../core/applied-tab-behavior';

export type TabTargetState = AppliedTabBehavior;

export type TabStateStore = {
  get: (
    keys?: string | string[] | Record<string, unknown> | null,
  ) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

const tabKey = (tabId: number): string => `tab:${tabId}`;

export function tabIdFromKey(key: string): number | null {
  const match = /^tab:(0|[1-9]\d*)$/.exec(key);
  if (!match) {
    return null;
  }
  const tabId = Number(match[1]);
  return Number.isSafeInteger(tabId) ? tabId : null;
}

export async function listTargetedTabIds(store: TabStateStore = sessionStore()): Promise<number[]> {
  const all = await store.get(null);
  const ids: number[] = [];
  for (const key of Object.keys(all)) {
    const tabId = tabIdFromKey(key);
    if (tabId != null) {
      ids.push(tabId);
    }
  }
  return ids;
}

function sessionStore(): TabStateStore {
  return chrome.storage.session;
}

export async function getTabState(
  tabId: number,
  store: TabStateStore = sessionStore(),
): Promise<TabTargetState | null> {
  const key = tabKey(tabId);
  const result = await store.get(key);
  const value = result[key];
  return isAppliedTabBehavior(value) ? value : null;
}

export async function setTabState(
  tabId: number,
  state: TabTargetState,
  store: TabStateStore = sessionStore(),
): Promise<void> {
  await store.set({ [tabKey(tabId)]: state });
}

export async function clearTabState(
  tabId: number,
  store: TabStateStore = sessionStore(),
): Promise<void> {
  await store.remove(tabKey(tabId));
}
