// SPDX-License-Identifier: GPL-3.0-only

import { adjustSpeed, DEFAULT_SPEED_POLICY, type SpeedPolicy } from '../core/speed';
import type { SetSpeedResponse } from '../core/messages';
import { getSiteKey } from '../storage/site-key';
import { getTabState, type TabStateStore } from '../storage/tab-state';
import { readAppliedTabBehavior, type AppliedBehaviorReader } from './applied-behavior';
import { setSpeed, type SetSpeedDeps } from './set-speed';

export type AdjustTabSpeedDeps = SetSpeedDeps & {
  readBehavior?: AppliedBehaviorReader;
  tabStore?: TabStateStore;
  policy?: SpeedPolicy;
  readTab?: (tabId: number) => Promise<Pick<chrome.tabs.Tab, 'url'>>;
};

async function resolveSenderTabUrl(
  sender: chrome.runtime.MessageSender,
  readTab: (tabId: number) => Promise<Pick<chrome.tabs.Tab, 'url'>>,
): Promise<{ tabId: number; url: string } | null> {
  const tabId = sender.tab?.id;
  if (tabId == null) {
    return null;
  }
  if (sender.tab?.url && getSiteKey(sender.tab.url).supported) {
    return { tabId, url: sender.tab.url };
  }
  try {
    const tab = await readTab(tabId);
    if (tab.url && getSiteKey(tab.url).supported) {
      return { tabId, url: tab.url };
    }
  } catch {
    // chrome.tabs.get omits url without host access; treat as unsupported.
  }
  return null;
}

export async function adjustTabSpeed(
  sender: chrome.runtime.MessageSender,
  direction: -1 | 1,
  deps: AdjustTabSpeedDeps = {},
): Promise<SetSpeedResponse> {
  const resolved = await resolveSenderTabUrl(
    sender,
    deps.readTab ?? ((tabId) => chrome.tabs.get(tabId)),
  );
  if (!resolved) {
    return { ok: false, error: 'Unsupported tab' };
  }
  const { tabId, url } = resolved;

  const existing = await getTabState(tabId, deps.tabStore);
  let current: number;
  if (existing) {
    current = existing.targetSpeed;
  } else {
    try {
      const readBehavior = deps.readBehavior ?? readAppliedTabBehavior;
      current = (await readBehavior(url)).targetSpeed;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to resolve site behavior',
      };
    }
  }

  const policy = deps.policy ?? DEFAULT_SPEED_POLICY;
  return setSpeed(tabId, url, adjustSpeed(current, direction, policy), deps);
}
