// SPDX-License-Identifier: GPL-3.0-only

import {
  builtInAppliedTabBehavior,
  nonTargetBehaviorFrom,
  toAppliedTabBehavior,
  type AppliedTabBehavior,
} from '../core/applied-tab-behavior';
import { builtInEffectiveHotkeys, type EffectiveHotkeyMap } from '../settings/hotkey-binding';
import {
  resolveSiteBehavior,
  toEffectiveBehavior,
  toEffectiveHotkeys,
} from '../settings/site-behavior';
import { resolveSiteBehaviorForUrl, type SiteSettingsDeps } from '../storage/site-settings';

export type AppliedTabPayload = {
  behavior: AppliedTabBehavior;
  hotkeys: EffectiveHotkeyMap;
};

export type OverlaySeed = Omit<AppliedTabBehavior, 'targetSpeed'>;

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

export async function readAppliedTabPayload(
  url: string,
  deps: SiteSettingsDeps = { touchUsage: true },
): Promise<AppliedTabPayload> {
  const resolved = await resolveSiteBehaviorForUrl(url, deps);
  if (!resolved) {
    return {
      behavior: builtInAppliedTabBehavior(),
      hotkeys: toEffectiveHotkeys(resolveSiteBehavior()),
    };
  }
  return {
    behavior: toAppliedTabBehavior(toEffectiveBehavior(resolved)),
    hotkeys: toEffectiveHotkeys(resolved),
  };
}

export function builtInAppliedTabPayload(): AppliedTabPayload {
  return {
    behavior: builtInAppliedTabBehavior(),
    hotkeys: builtInEffectiveHotkeys(),
  };
}

export async function readOverlaySeed(
  url: string,
  readBehavior: AppliedBehaviorReader = (targetUrl) =>
    readAppliedTabBehavior(targetUrl, { touchUsage: false }),
): Promise<OverlaySeed> {
  try {
    return nonTargetBehaviorFrom(await readBehavior(url));
  } catch {
    return nonTargetBehaviorFrom(builtInAppliedTabBehavior());
  }
}
