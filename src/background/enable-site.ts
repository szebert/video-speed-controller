// SPDX-License-Identifier: GPL-3.0-only

import type { AppliedTabBehavior } from '../core/applied-tab-behavior';
import type { EnableSiteResponse } from '../core/messages';
import { clearTabState, getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { readAppliedTabBehavior, type AppliedBehaviorReader } from './applied-behavior';
import { applyTabBehavior } from './broadcast';
import { ensureCurrentTabEngine, type ScriptInjector } from './inject';

export type EnableSiteDeps = {
  scripting?: ScriptInjector;
  tabStore?: TabStateStore;
  readBehavior?: AppliedBehaviorReader;
  apply?: typeof applyTabBehavior;
  ensure?: typeof ensureCurrentTabEngine;
};

export async function enableSite(
  tabId: number,
  url: string,
  deps: EnableSiteDeps = {},
): Promise<EnableSiteResponse> {
  const tabStore = deps.tabStore;
  const existing = await getTabState(tabId, tabStore);
  const created = !existing;
  const readBehavior = deps.readBehavior ?? readAppliedTabBehavior;
  let behavior: AppliedTabBehavior;
  if (existing) {
    behavior = existing;
  } else {
    try {
      behavior = await readBehavior(url);
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
  try {
    await ensure(tabId, deps.scripting);
    await apply(tabId, behavior);
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
