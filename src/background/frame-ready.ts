// SPDX-License-Identifier: GPL-3.0-only

import { builtInAppliedTabBehavior, type AppliedTabBehavior } from '../core/applied-tab-behavior';
import type { FrameReadyResponse } from '../core/messages';
import { getSiteKey } from '../storage/site-key';
import { clearTabState, getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { readAppliedTabBehavior, type AppliedBehaviorReader } from './applied-behavior';
import { applyTabBehavior } from './broadcast';

export type FrameReadyDeps = {
  tabStore?: TabStateStore;
  readBehavior?: AppliedBehaviorReader;
  apply?: typeof applyTabBehavior;
};

export async function handleFrameReady(
  sender: chrome.runtime.MessageSender,
  deps: FrameReadyDeps = {},
): Promise<FrameReadyResponse> {
  const tabId = sender.tab?.id;
  if (tabId == null) {
    return { action: 'dormant' };
  }

  const tabStore = deps.tabStore;
  const apply = deps.apply ?? applyTabBehavior;
  const existing = await getTabState(tabId, tabStore);
  const isTopFrame = sender.frameId === 0;

  if (existing) {
    await apply(tabId, existing);
    return { action: 'applied' };
  }

  if (!isTopFrame) {
    return { action: 'dormant' };
  }

  const url = sender.url ?? sender.tab?.url;
  const siteKey = url ? getSiteKey(url) : { supported: false as const };
  const readBehavior = deps.readBehavior ?? readAppliedTabBehavior;
  let behavior: AppliedTabBehavior;
  if (siteKey.supported && url) {
    behavior = await readBehavior(url);
  } else {
    behavior = builtInAppliedTabBehavior();
  }
  await setTabState(tabId, behavior, tabStore);

  try {
    await apply(tabId, behavior);
  } catch (error) {
    await clearTabState(tabId, tabStore);
    throw error;
  }

  return { action: 'applied' };
}
