// SPDX-License-Identifier: GPL-3.0-only

import { builtInAppliedTabBehavior, type AppliedTabBehavior } from '../core/applied-tab-behavior';
import type { FrameReadyResponse } from '../protocol/content/content-background';
import type { EffectiveHotkeyMap } from '../settings/hotkey-binding';
import { getSiteKey } from '../storage/site-key';
import { clearTabState, getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { readAppliedTabPayload } from './applied-behavior';
import { applyTabBehavior } from './broadcast';

export type FrameReadyDeps = {
  tabStore?: TabStateStore;
  readPayload?: typeof readAppliedTabPayload;
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
  const readPayload = deps.readPayload ?? readAppliedTabPayload;
  const pageUrl = supportedPageUrl(sender);

  if (existing) {
    const hotkeys = await resolveHotkeysForUrl(pageUrl, readPayload);
    await apply(tabId, existing, undefined, hotkeys ? { hotkeys } : {});
    return { action: 'applied' };
  }

  if (!isTopFrame) {
    return { action: 'dormant' };
  }

  let behavior: AppliedTabBehavior;
  let hotkeys: EffectiveHotkeyMap | undefined;
  if (pageUrl) {
    const payload = await readPayload(pageUrl, { touchUsage: true });
    behavior = payload.behavior;
    hotkeys = payload.hotkeys;
  } else {
    behavior = builtInAppliedTabBehavior();
  }
  await setTabState(tabId, behavior, tabStore);

  try {
    await apply(tabId, behavior, undefined, hotkeys ? { hotkeys } : {});
  } catch (error) {
    await clearTabState(tabId, tabStore);
    throw error;
  }

  return { action: 'applied' };
}

function supportedPageUrl(sender: chrome.runtime.MessageSender): string | null {
  const tabUrl = sender.tab?.url;
  if (tabUrl && getSiteKey(tabUrl).supported) {
    return tabUrl;
  }
  const frameUrl = sender.url;
  if (frameUrl && getSiteKey(frameUrl).supported) {
    return frameUrl;
  }
  return null;
}

async function resolveHotkeysForUrl(
  url: string | null,
  readPayload: typeof readAppliedTabPayload,
): Promise<EffectiveHotkeyMap | undefined> {
  if (!url) {
    return undefined;
  }
  try {
    return (await readPayload(url, { touchUsage: false })).hotkeys;
  } catch {
    return undefined;
  }
}
