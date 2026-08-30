// SPDX-License-Identifier: GPL-3.0-only

import {
  builtInAppliedTabBehavior,
  overlayFieldsFrom,
  toAppliedTabBehavior,
  type AppliedTabBehavior,
} from '../core/applied-tab-behavior';
import { toEffectiveBehavior } from '../settings/site-behavior';
import { resolveSiteBehaviorForUrl, type SiteSettingsDeps } from '../storage/site-settings';

export type OverlaySeed = Pick<
  AppliedTabBehavior,
  'overlayPosition' | 'overlayAutoHide' | 'overlayAutoHideDelayMs'
>;

export type AppliedBehaviorReader = (url: string) => Promise<AppliedTabBehavior>;

export async function readAppliedTabBehavior(
  url: string,
  deps: SiteSettingsDeps = { touchUsage: true },
): Promise<AppliedTabBehavior> {
  const resolved = await resolveSiteBehaviorForUrl(url, deps);
  if (!resolved) {
    return builtInAppliedTabBehavior();
  }
  return toAppliedTabBehavior(toEffectiveBehavior(resolved));
}

export async function readOverlaySeed(
  url: string,
  readBehavior: AppliedBehaviorReader = (targetUrl) =>
    readAppliedTabBehavior(targetUrl, { touchUsage: false }),
): Promise<OverlaySeed> {
  try {
    return overlayFieldsFrom(await readBehavior(url));
  } catch {
    return overlayFieldsFrom(builtInAppliedTabBehavior());
  }
}
