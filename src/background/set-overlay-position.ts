// SPDX-License-Identifier: GPL-3.0-only

import { isOverlayPosition, type OverlayPosition } from '../settings/site-behavior';
import { persistSiteBehaviorChange, type SiteSettingsDeps } from '../storage/site-settings';
import { getSiteKey } from '../storage/site-key';
import { resolveSenderTabUrl } from './adjust-tab-speed';
import {
  reapplyBehaviorSettings,
  type ReapplyBehaviorSettingsDeps,
} from './reapply-behavior-settings';

export type SetOverlayPositionResponse =
  { ok: true; persistError?: string } | { ok: false; error: string };

export type SetOverlayPositionDeps = SiteSettingsDeps &
  ReapplyBehaviorSettingsDeps & {
    readTab?: (tabId: number) => Promise<Pick<chrome.tabs.Tab, 'url'>>;
  };

export async function setOverlayPositionFromSender(
  sender: chrome.runtime.MessageSender,
  position: OverlayPosition,
  deps: SetOverlayPositionDeps = {},
): Promise<SetOverlayPositionResponse> {
  if (!isOverlayPosition(position)) {
    return { ok: false, error: 'Invalid position' };
  }
  const resolved = await resolveSenderTabUrl(
    sender,
    deps.readTab ?? ((tabId) => chrome.tabs.get(tabId)),
  );
  if (!resolved) {
    return { ok: false, error: 'Unsupported tab' };
  }
  const key = getSiteKey(resolved.url);
  if (!key.supported) {
    return { ok: false, error: 'Unsupported tab' };
  }

  try {
    await persistSiteBehaviorChange(
      resolved.url,
      { kind: 'value', field: 'overlayPosition', value: position },
      deps,
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to persist overlay position',
    };
  }

  const reapply = await reapplyBehaviorSettings(
    {
      scope: { kind: 'site', hostname: key.hostname },
      mode: 'preserve-target',
    },
    deps,
  );
  if (reapply.reapplyError || reapply.reapplyFailures > 0) {
    return {
      ok: true,
      persistError: reapply.reapplyError ?? 'Failed to apply overlay position',
    };
  }
  return { ok: true };
}
