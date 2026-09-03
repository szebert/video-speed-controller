// SPDX-License-Identifier: GPL-3.0-only

import { containsExactOriginAccess } from '../access/site-access';
import type { PopupStateResponse } from '../core/messages';
import { DEFAULT_SPEED_POLICY } from '../core/speed';
import { toEffectiveBehavior } from '../settings/site-behavior';
import { getSiteKey } from '../storage/site-key';
import { readSiteSpeed, resolveSiteBehaviorForUrl } from '../storage/site-settings';
import { getTabState } from '../storage/tab-state';

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

export async function getPopupState(tabId: number, url: string): Promise<PopupStateResponse> {
  const siteKey = getSiteKey(url);
  if (!siteKey.supported) {
    return unsupportedState();
  }

  const [siteSpeed, resolved, tabState, siteAccess] = await Promise.all([
    readSiteSpeed(url),
    resolveSiteBehaviorForUrl(url, { touchUsage: false }),
    getTabState(tabId),
    containsExactOriginAccess(url),
  ]);
  const effective = resolved ? toEffectiveBehavior(resolved) : null;

  return {
    supported: true,
    hostname: siteKey.hostname,
    siteSpeed,
    tabTarget: tabState?.targetSpeed ?? null,
    siteAccess,
    speedMin: effective?.speedMin ?? DEFAULT_SPEED_POLICY.min,
    speedMax: effective?.speedMax ?? DEFAULT_SPEED_POLICY.max,
    speedTick: effective?.speedTick ?? DEFAULT_SPEED_POLICY.tick,
  };
}
