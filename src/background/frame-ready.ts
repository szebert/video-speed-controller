// SPDX-License-Identifier: GPL-3.0-only

import { resolveEffectiveSpeed } from '../core/speed';
import type { FrameReadyResponse } from '../core/messages';
import { getSiteKey } from '../storage/site-key';
import { readSiteSpeed } from '../storage/site-settings';
import { clearTabState, getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { applyTabTarget } from './broadcast';

export type FrameReadyDeps = {
  tabStore?: TabStateStore;
  readSpeed?: typeof readSiteSpeed;
  apply?: typeof applyTabTarget;
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
  const apply = deps.apply ?? applyTabTarget;
  const existing = await getTabState(tabId, tabStore);
  const isTopFrame = sender.frameId === 0;

  if (existing) {
    await apply(tabId, existing.targetSpeed);
    return { action: 'applied' };
  }

  if (!isTopFrame) {
    return { action: 'dormant' };
  }

  const url = sender.url ?? sender.tab?.url;
  const siteKey = url ? getSiteKey(url) : { supported: false as const };
  const readSpeed =
    deps.readSpeed ?? ((targetUrl: string) => readSiteSpeed(targetUrl, { touchUsage: true }));
  const siteSpeed = siteKey.supported && url ? await readSpeed(url) : null;
  const targetSpeed = resolveEffectiveSpeed(siteSpeed);
  await setTabState(tabId, { targetSpeed }, tabStore);

  try {
    await apply(tabId, targetSpeed);
  } catch (error) {
    await clearTabState(tabId, tabStore);
    throw error;
  }

  return { action: 'applied' };
}
