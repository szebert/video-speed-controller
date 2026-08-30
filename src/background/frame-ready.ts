// SPDX-License-Identifier: GPL-3.0-only

import { resolveEffectiveSpeed } from '../core/speed';
import type { FrameReadyResponse } from '../core/messages';
import { getSiteKey } from '../storage/site-key';
import { readSiteSpeed } from '../storage/site-settings';
import { getTabState, setTabState } from '../storage/tab-state';
import { applyTabTarget } from './broadcast';

export async function handleFrameReady(
  sender: chrome.runtime.MessageSender,
): Promise<FrameReadyResponse> {
  const tabId = sender.tab?.id;
  if (tabId == null) {
    return { action: 'dormant' };
  }

  const existing = await getTabState(tabId);
  const isTopFrame = sender.frameId === 0;

  if (isTopFrame) {
    if (existing) {
      return { action: 'apply', targetSpeed: existing.targetSpeed };
    }
    const url = sender.url ?? sender.tab?.url;
    const siteKey = url ? getSiteKey(url) : { supported: false as const };
    const siteSpeed =
      siteKey.supported && url ? await readSiteSpeed(url, { touchUsage: true }) : null;
    const targetSpeed = resolveEffectiveSpeed(siteSpeed);
    await setTabState(tabId, { targetSpeed });
    await applyTabTarget(tabId, targetSpeed);
    return { action: 'apply', targetSpeed };
  }

  if (existing) {
    return { action: 'apply', targetSpeed: existing.targetSpeed };
  }
  return { action: 'dormant' };
}
