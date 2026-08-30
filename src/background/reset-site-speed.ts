// SPDX-License-Identifier: GPL-3.0-only

import type { AppliedTabBehavior } from '../core/applied-tab-behavior';
import type { SetSpeedResponse } from '../core/messages';
import {
  persistSiteSpeedInherit,
  resolveSpeedAfterSiteInherit,
  type SiteSettingsDeps,
} from '../storage/site-settings';
import { clearTabState, getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { readOverlaySeed, type OverlaySeed } from './applied-behavior';
import { applyTabBehavior } from './broadcast';
import { ensureCurrentTabEngine, type ScriptInjector } from './inject';

export type ResetSiteSpeedDeps = {
  scripting?: ScriptInjector;
  tabStore?: TabStateStore;
  persistInherit?: (url: string) => Promise<void>;
  resolveSpeed?: (url: string) => Promise<number>;
  readOverlay?: (url: string) => Promise<OverlaySeed>;
  apply?: typeof applyTabBehavior;
  ensure?: typeof ensureCurrentTabEngine;
  storage?: SiteSettingsDeps;
};

async function restoreTabTarget(
  tabId: number,
  previous: Awaited<ReturnType<typeof getTabState>>,
  tabStore?: TabStateStore,
): Promise<void> {
  if (previous) {
    await setTabState(tabId, previous, tabStore);
    return;
  }
  await clearTabState(tabId, tabStore);
}

export async function resetSiteSpeed(
  tabId: number,
  url: string,
  deps: ResetSiteSpeedDeps = {},
): Promise<SetSpeedResponse> {
  const resolveSpeed =
    deps.resolveSpeed ??
    ((targetUrl: string) => resolveSpeedAfterSiteInherit(targetUrl, deps.storage));
  let targetSpeed: number;
  try {
    targetSpeed = await resolveSpeed(url);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to resolve reset speed',
    };
  }

  const tabStore = deps.tabStore;
  const previous = await getTabState(tabId, tabStore);
  const overlay = previous ?? (await (deps.readOverlay ?? readOverlaySeed)(url));
  const next: AppliedTabBehavior = { ...overlay, targetSpeed };
  await setTabState(tabId, next, tabStore);

  const ensure = deps.ensure ?? ensureCurrentTabEngine;
  const apply = deps.apply ?? applyTabBehavior;
  try {
    await ensure(tabId, deps.scripting);
    await apply(tabId, next);
  } catch (error) {
    await restoreTabTarget(tabId, previous, tabStore);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Top-frame injection failed',
    };
  }

  try {
    const persistInherit =
      deps.persistInherit ??
      ((targetUrl: string) => persistSiteSpeedInherit(targetUrl, deps.storage));
    await persistInherit(url);
    return { ok: true, targetSpeed };
  } catch (error) {
    return {
      ok: true,
      targetSpeed,
      persistError: error instanceof Error ? error.message : 'Failed to persist siteSpeed',
    };
  }
}
