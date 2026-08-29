// SPDX-License-Identifier: GPL-3.0-only

import {
  canonicalizeSpeed,
  clampSpeed,
  DEFAULT_SPEED_POLICY,
  type SpeedPolicy,
} from '../core/speed';
import type { SetSpeedResponse } from '../core/messages';
import { persistSiteSpeed } from '../storage/site-settings';
import { clearTabState, getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { applyTabTarget } from './broadcast';
import { ensureCurrentTabEngine, type ScriptInjector } from './inject';

export type SetSpeedDeps = {
  scripting?: ScriptInjector;
  tabStore?: TabStateStore;
  persist?: typeof persistSiteSpeed;
  apply?: typeof applyTabTarget;
  ensure?: typeof ensureCurrentTabEngine;
  policy?: SpeedPolicy;
};

export async function setSpeed(
  tabId: number,
  url: string,
  proposed: number,
  deps: SetSpeedDeps = {},
): Promise<SetSpeedResponse> {
  if (!Number.isFinite(proposed)) {
    return { ok: false, error: 'Speed must be a finite number' };
  }

  const policy = deps.policy ?? DEFAULT_SPEED_POLICY;
  const canonical = canonicalizeSpeed(clampSpeed(proposed, policy));
  const tabStore = deps.tabStore;
  const previous = await getTabState(tabId, tabStore);
  await setTabState(tabId, { targetSpeed: canonical }, tabStore);

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
  await apply(tabId, canonical);

  try {
    const persist = deps.persist ?? persistSiteSpeed;
    await persist(url, canonical);
    return { ok: true, targetSpeed: canonical };
  } catch (error) {
    return {
      ok: true,
      targetSpeed: canonical,
      persistError: error instanceof Error ? error.message : 'Failed to persist siteSpeed',
    };
  }
}
