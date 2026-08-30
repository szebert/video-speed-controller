// SPDX-License-Identifier: GPL-3.0-only

import {
  canonicalizeSpeed,
  clampSpeed,
  DEFAULT_SPEED_POLICY,
  type SpeedPolicy,
} from '../core/speed';
import type { AppliedTabBehavior } from '../core/applied-tab-behavior';
import type { SetSpeedResponse } from '../core/messages';
import { persistSiteSpeed } from '../storage/site-settings';
import { clearTabState, getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { readOverlaySeed, type OverlaySeed } from './applied-behavior';
import { applyTabBehavior } from './broadcast';
import { ensureCurrentTabEngine, type ScriptInjector } from './inject';

export type SetSpeedDeps = {
  scripting?: ScriptInjector;
  tabStore?: TabStateStore;
  persist?: typeof persistSiteSpeed;
  apply?: typeof applyTabBehavior;
  ensure?: typeof ensureCurrentTabEngine;
  readOverlay?: (url: string) => Promise<OverlaySeed>;
  policy?: SpeedPolicy;
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
  const overlay = previous ?? (await (deps.readOverlay ?? readOverlaySeed)(url));
  const next: AppliedTabBehavior = { ...overlay, targetSpeed: canonical };
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
