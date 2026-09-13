// SPDX-License-Identifier: GPL-3.0-only

import type { TabSpeedAction } from '../core/controller-action';
import type { DispatchTabActionResponse } from '../protocol/content/content-background';
import { getTabState } from '../storage/tab-state';
import { readAppliedTabBehavior } from './applied-behavior';
import { adjustTabSpeed, resolveSenderTabUrl, type AdjustTabSpeedDeps } from './adjust-tab-speed';
import { setSpeed } from './set-speed';

export async function dispatchTabAction(
  sender: chrome.runtime.MessageSender,
  action: TabSpeedAction,
  deps: AdjustTabSpeedDeps = {},
): Promise<DispatchTabActionResponse> {
  const resolved = await resolveSenderTabUrl(
    sender,
    deps.readTab ?? ((tabId) => chrome.tabs.get(tabId)),
  );
  if (!resolved) {
    return { ok: false, error: 'Unsupported tab' };
  }

  const previousTargetSpeed = await readPreviousTargetSpeed(resolved.tabId, resolved.url, deps);
  if (previousTargetSpeed == null) {
    return { ok: false, error: 'Failed to resolve site behavior' };
  }

  const result =
    action === 'increaseSpeed'
      ? await adjustTabSpeed(sender, 1, deps)
      : action === 'decreaseSpeed'
        ? await adjustTabSpeed(sender, -1, deps)
        : await setSpeed(resolved.tabId, resolved.url, 1, { ...deps, persist: false });

  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    previousTargetSpeed,
    targetSpeed: result.targetSpeed,
    ...(result.persistError ? { persistError: result.persistError } : {}),
  };
}

async function readPreviousTargetSpeed(
  tabId: number,
  url: string,
  deps: AdjustTabSpeedDeps,
): Promise<number | null> {
  const existing = await getTabState(tabId, deps.tabStore);
  if (existing) {
    return existing.targetSpeed;
  }
  try {
    const readBehavior = deps.readBehavior ?? readAppliedTabBehavior;
    const behavior = await readBehavior(url);
    return behavior.targetSpeed;
  } catch {
    return null;
  }
}
