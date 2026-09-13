// SPDX-License-Identifier: GPL-3.0-only

import type { AppliedTabBehavior } from '../core/applied-tab-behavior';
import type { EffectiveHotkeyMap } from '../settings/hotkey-binding';
import type { EnableSiteResponse } from '../protocol/schemas/popup-background';
import { clearTabState, getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { readAppliedTabPayload, type AppliedBehaviorReader } from './applied-behavior';
import { applyTabBehavior, isNoReceiverError } from './broadcast';
import { ensureCurrentTabEngine, type ScriptInjector } from './inject';
import { enqueuePermissionsReconcile } from './permissions-lifecycle';

export type EnableSiteDeps = {
  scripting?: ScriptInjector;
  tabStore?: TabStateStore;
  readBehavior?: AppliedBehaviorReader;
  readPayload?: typeof readAppliedTabPayload;
  apply?: typeof applyTabBehavior;
  ensure?: typeof ensureCurrentTabEngine;
  reconcilePermissions?: () => Promise<unknown>;
};

async function readHotkeys(
  url: string,
  deps: EnableSiteDeps,
): Promise<EffectiveHotkeyMap | undefined> {
  if (deps.readBehavior && !deps.readPayload) {
    return undefined;
  }
  try {
    return (await (deps.readPayload ?? readAppliedTabPayload)(url, { touchUsage: false })).hotkeys;
  } catch {
    return undefined;
  }
}

export async function enableSite(
  tabId: number,
  url: string,
  deps: EnableSiteDeps = {},
): Promise<EnableSiteResponse> {
  const reconcile = deps.reconcilePermissions ?? enqueuePermissionsReconcile;
  await reconcile();

  const tabStore = deps.tabStore;
  const existing = await getTabState(tabId, tabStore);
  const created = !existing;
  let behavior: AppliedTabBehavior;
  let hotkeys: EffectiveHotkeyMap | undefined;
  if (existing) {
    behavior = existing;
    hotkeys = await readHotkeys(url, deps);
  } else {
    try {
      if (deps.readBehavior) {
        behavior = await deps.readBehavior(url);
        hotkeys = await readHotkeys(url, deps);
      } else {
        const payload = await (deps.readPayload ?? readAppliedTabPayload)(url);
        behavior = payload.behavior;
        hotkeys = payload.hotkeys;
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to resolve site behavior',
      };
    }
    await setTabState(tabId, behavior, tabStore);
  }
  const ensure = deps.ensure ?? ensureCurrentTabEngine;
  const apply = deps.apply ?? applyTabBehavior;
  const applyOptions = {
    ignoreNoReceiver: false,
    ...(hotkeys ? { hotkeys } : {}),
  };

  try {
    await ensure(tabId, deps.scripting);
    try {
      await apply(tabId, behavior, undefined, applyOptions);
    } catch (error) {
      if (!isNoReceiverError(error)) {
        throw error;
      }
      await ensure(tabId, deps.scripting);
      await apply(tabId, behavior, undefined, applyOptions);
    }
  } catch (error) {
    if (created) {
      await clearTabState(tabId, tabStore);
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Top-frame injection failed',
    };
  }

  return { ok: true, targetSpeed: behavior.targetSpeed };
}
