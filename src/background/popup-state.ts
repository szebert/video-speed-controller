// SPDX-License-Identifier: GPL-3.0-only

import { containsExactOriginAccess } from '../access/site-access';
import type { PopupStateResponse } from '../core/messages';
import { getSiteKey } from '../storage/site-key';
import { readSiteSpeed } from '../storage/site-settings';
import { getTabState } from '../storage/tab-state';

export async function getPopupState(tabId: number, url: string): Promise<PopupStateResponse> {
  const siteKey = getSiteKey(url);
  if (!siteKey.supported) {
    return {
      supported: false,
      hostname: null,
      siteSpeed: null,
      tabTarget: null,
      siteAccess: false,
    };
  }

  const [siteSpeed, tabState, siteAccess] = await Promise.all([
    readSiteSpeed(url),
    getTabState(tabId),
    containsExactOriginAccess(url),
  ]);

  return {
    supported: true,
    hostname: siteKey.hostname,
    siteSpeed,
    tabTarget: tabState?.targetSpeed ?? null,
    siteAccess,
  };
}
