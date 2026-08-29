// SPDX-License-Identifier: GPL-3.0-only

export type TabTargetState = {
  targetSpeed: number;
};

export type TabStateStore = {
  get: (
    keys?: string | string[] | Record<string, unknown> | null,
  ) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

const tabKey = (tabId: number): string => `tab:${tabId}`;

function isTabTargetState(value: unknown): value is TabTargetState {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as TabTargetState).targetSpeed === 'number' &&
    Number.isFinite((value as TabTargetState).targetSpeed)
  );
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
  return isTabTargetState(value) ? value : null;
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
