// SPDX-License-Identifier: GPL-3.0-only

import type { TabSpeedAction } from '../core/controller-action';
import type { DispatchTabActionResponse } from '../protocol/content/content-background';
import { adjustTabSpeed, resolveSenderTabUrl, type AdjustTabSpeedDeps } from './adjust-tab-speed';
import { setSpeed } from './set-speed';

export async function dispatchTabAction(
  sender: chrome.runtime.MessageSender,
  action: TabSpeedAction,
  deps: AdjustTabSpeedDeps = {},
): Promise<DispatchTabActionResponse> {
  if (action === 'increaseSpeed') {
    return adjustTabSpeed(sender, 1, deps);
  }
  if (action === 'decreaseSpeed') {
    return adjustTabSpeed(sender, -1, deps);
  }

  const resolved = await resolveSenderTabUrl(
    sender,
    deps.readTab ?? ((tabId) => chrome.tabs.get(tabId)),
  );
  if (!resolved) {
    return { ok: false, error: 'Unsupported tab' };
  }
  return setSpeed(resolved.tabId, resolved.url, 1, { ...deps, persist: false });
}
