// SPDX-License-Identifier: GPL-3.0-only

import { containsExactOriginAccess } from '../access/site-access';
import type { PopupStateResponse } from '../protocol/schemas/popup-background';
import { DEFAULT_SPEED_POLICY } from '../core/speed';
import { toEffectiveBehavior } from '../settings/site-behavior';
import { getSiteKey } from '../storage/site-key';
import { resolveSiteBehaviorForUrl } from '../storage/site-settings';
import { getTabState } from '../storage/tab-state';

export type PopupStateDeps = {
  resolveBehavior?: typeof resolveSiteBehaviorForUrl;
  readTabState?: typeof getTabState;
  hasAccess?: (url: string) => Promise<boolean>;
};

function unsupportedState(): PopupStateResponse {
  return {
    supported: false,
    hostname: null,
    siteSpeed: null,
    tabTarget: null,
    siteAccess: false,
    speedMin: DEFAULT_SPEED_POLICY.min,
    speedMax: DEFAULT_SPEED_POLICY.max,
    speedTick: DEFAULT_SPEED_POLICY.tick,
  };
}

export async function getPopupState(
  tabId: number,
  url: string,
  deps: PopupStateDeps = {},
): Promise<PopupStateResponse> {
  const siteKey = getSiteKey(url);
  if (!siteKey.supported) {
    return unsupportedState();
  }

  const resolveBehavior = deps.resolveBehavior ?? resolveSiteBehaviorForUrl;
  const readTabState = deps.readTabState ?? getTabState;
  const hasAccess = deps.hasAccess ?? containsExactOriginAccess;
  const [resolved, tabState, siteAccess] = await Promise.all([
    resolveBehavior(url, { touchUsage: false }),
    readTabState(tabId),
    hasAccess(url),
  ]);
  const effective = resolved ? toEffectiveBehavior(resolved) : null;

  return {
    supported: true,
    hostname: siteKey.hostname,
    siteSpeed: effective?.speed ?? null,
    tabTarget: tabState?.targetSpeed ?? null,
    siteAccess,
    speedMin: effective?.speedMin ?? DEFAULT_SPEED_POLICY.min,
    speedMax: effective?.speedMax ?? DEFAULT_SPEED_POLICY.max,
    speedTick: effective?.speedTick ?? DEFAULT_SPEED_POLICY.tick,
  };
}
