// SPDX-License-Identifier: GPL-3.0-only

import { resolveEffectiveSpeed } from '../core/speed';
import type { EnableSiteResponse } from '../core/messages';
import { readSiteSpeed } from '../storage/site-settings';
import { clearTabState, getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { applyTabTarget } from './broadcast';
import { ensureCurrentTabEngine, type ScriptInjector } from './inject';

export type EnableSiteDeps = {
  scripting?: ScriptInjector;
  tabStore?: TabStateStore;
  readSpeed?: typeof readSiteSpeed;
  apply?: typeof applyTabTarget;
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
  const readSpeed =
    deps.readSpeed ?? ((targetUrl: string) => readSiteSpeed(targetUrl, { touchUsage: true }));
  const targetSpeed = existing?.targetSpeed ?? resolveEffectiveSpeed(await readSpeed(url));

  if (created) {
    await setTabState(tabId, { targetSpeed }, tabStore);
  }

  const ensure = deps.ensure ?? ensureCurrentTabEngine;
  try {
    await ensure(tabId, deps.scripting);
  } catch (error) {
    if (created) {
      await clearTabState(tabId, tabStore);
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Top-frame injection failed',
    };
  }

  const apply = deps.apply ?? applyTabTarget;
  await apply(tabId, targetSpeed);
  return { ok: true, targetSpeed };
}
