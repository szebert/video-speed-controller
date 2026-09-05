// SPDX-License-Identifier: GPL-3.0-only

import type { HostPattern } from '../access/site-access';
import type { AppliedTabBehavior } from '../core/applied-tab-behavior';
import type {
  ApplyTabBehaviorRequest,
  ReconcileAccessRequest,
} from '../protocol/types/background-content';

export type TabMessenger = {
  query: (queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>;
  sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
};

function isNoReceiverError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  );
}

export async function broadcastToAllTabs(
  message: ReconcileAccessRequest | ApplyTabBehaviorRequest,
  tabs: TabMessenger = chrome.tabs,
): Promise<void> {
  const allTabs = await tabs.query({});
  await Promise.allSettled(
    allTabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map(async (tab) => {
        try {
          await tabs.sendMessage(tab.id, message);
        } catch (error) {
          if (!isNoReceiverError(error)) {
            console.warn('OS VSC tab message failed', error);
          }
        }
      }),
  );
}

export async function applyTabBehavior(
  tabId: number,
  behavior: AppliedTabBehavior,
  tabs: TabMessenger = chrome.tabs,
  options: { ignoreNoReceiver?: boolean } = {},
): Promise<void> {
  try {
    await tabs.sendMessage(tabId, {
      type: 'APPLY_TAB_BEHAVIOR',
      behavior,
    } satisfies ApplyTabBehaviorRequest);
  } catch (error) {
    if (options.ignoreNoReceiver !== false && isNoReceiverError(error)) {
      return;
    }
    throw error;
  }
}

export async function broadcastReconcileAccess(
  allowedHostPatterns: HostPattern[],
  tabs: TabMessenger = chrome.tabs,
): Promise<void> {
  await broadcastToAllTabs({ type: 'RECONCILE_ACCESS', allowedHostPatterns }, tabs);
}
