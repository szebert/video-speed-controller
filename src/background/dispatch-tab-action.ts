// SPDX-License-Identifier: GPL-3.0-only

import type { AppliedTabBehavior } from '../core/applied-tab-behavior';
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

  const behavior = await readTabBehavior(resolved.tabId, resolved.url, deps);
  if (behavior == null) {
    return { ok: false, error: 'Failed to resolve site behavior' };
  }
  const previousTargetSpeed = behavior.targetSpeed;

  const result =
    action === 'increaseSpeed'
      ? await adjustTabSpeed(sender, 1, deps)
      : action === 'decreaseSpeed'
        ? await adjustTabSpeed(sender, -1, deps)
        : action === 'resetSpeedToOne'
          ? await setSpeed(resolved.tabId, resolved.url, 1, { ...deps, persist: false })
          : await setSpeed(resolved.tabId, resolved.url, behavior.defaultSpeed, deps);

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

async function readTabBehavior(
  tabId: number,
  url: string,
  deps: AdjustTabSpeedDeps,
): Promise<AppliedTabBehavior | null> {
  const existing = await getTabState(tabId, deps.tabStore);
  if (existing) {
    return existing;
  }
  try {
    const readBehavior = deps.readBehavior ?? readAppliedTabBehavior;
    return await readBehavior(url);
  } catch {
    return null;
  }
}
