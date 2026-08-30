// SPDX-License-Identifier: GPL-3.0-only

import type { SetSpeedResponse } from '../core/messages';
import {
  persistSiteSpeedInherit,
  resolveSpeedAfterSiteInherit,
  type SiteSettingsDeps,
} from '../storage/site-settings';
import { clearTabState, getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { applyTabTarget } from './broadcast';
import { ensureCurrentTabEngine, type ScriptInjector } from './inject';

export type ResetSiteSpeedDeps = {
  scripting?: ScriptInjector;
  tabStore?: TabStateStore;
  persistInherit?: (url: string) => Promise<void>;
  resolveSpeed?: (url: string) => Promise<number>;
  apply?: typeof applyTabTarget;
  ensure?: typeof ensureCurrentTabEngine;
  storage?: SiteSettingsDeps;
};

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
  await setTabState(tabId, { targetSpeed }, tabStore);

  const ensure = deps.ensure ?? ensureCurrentTabEngine;
  try {
    await ensure(tabId, deps.scripting);
  } catch (error) {
    if (previous) {
      await setTabState(tabId, previous, tabStore);
    } else {
      await clearTabState(tabId, tabStore);
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Top-frame injection failed',
    };
  }

  const apply = deps.apply ?? applyTabTarget;
  await apply(tabId, targetSpeed);

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
