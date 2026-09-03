// SPDX-License-Identifier: GPL-3.0-only

import {
  appliedTabBehaviorEqual,
  overlayFieldsFrom,
  type AppliedTabBehavior,
} from '../core/applied-tab-behavior';
import type { BehaviorSettingsScope, ReapplyResult } from '../core/messages';
import { isSpeedRetargetField, type BehaviorSettingChange } from '../settings/site-behavior';
import { getSiteKey } from '../storage/site-key';
import { getTabState, setTabState, type TabStateStore } from '../storage/tab-state';
import { enqueueTabMutation } from './tab-mutation-queue';
import { applyTabBehavior, type TabMessenger } from './broadcast';
import { readAppliedTabBehavior } from './applied-behavior';

export type ReapplyBehaviorSettingsDeps = {
  queryTabs?: () => Promise<chrome.tabs.Tab[]>;
  getTab?: (tabId: number) => Promise<chrome.tabs.Tab>;
  getTabState?: typeof getTabState;
  setTabState?: typeof setTabState;
  readBehavior?: typeof readAppliedTabBehavior;
  apply?: typeof applyTabBehavior;
  enqueue?: typeof enqueueTabMutation;
  tabStateStore?: TabStateStore;
  tabs?: TabMessenger;
};

export type ReapplyScope = BehaviorSettingsScope | { kind: 'all' };

export type ReapplyBehaviorRequest = {
  scope: ReapplyScope;
  change: BehaviorSettingChange;
};

type TabOutcome = 'applied' | 'skipped' | 'failed';

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function reapplyOneTab(
  tabId: number,
  request: ReapplyBehaviorRequest,
  deps: ReapplyBehaviorSettingsDeps,
): Promise<TabOutcome> {
  const readState = deps.getTabState ?? getTabState;
  const writeState = deps.setTabState ?? setTabState;
  const readTab = deps.getTab ?? ((id: number) => chrome.tabs.get(id));
  const readBehavior = deps.readBehavior ?? readAppliedTabBehavior;
  const apply = deps.apply ?? applyTabBehavior;
  const store = deps.tabStateStore;

  const previous = await readState(tabId, store);
  if (!previous) {
    return 'skipped';
  }

  let tab: chrome.tabs.Tab;
  try {
    tab = await readTab(tabId);
  } catch {
    return 'failed';
  }
  const url = tab.url;
  if (!url) {
    return 'skipped';
  }
  const key = getSiteKey(url);
  if (!key.supported) {
    return 'skipped';
  }
  if (request.scope.kind === 'site' && key.hostname !== request.scope.hostname) {
    return 'skipped';
  }

  let next: AppliedTabBehavior;
  try {
    const fresh = await readBehavior(url, { touchUsage: false });
    next = isSpeedRetargetField(request.change.field)
      ? fresh
      : { ...previous, ...overlayFieldsFrom(fresh) };
  } catch {
    return 'failed';
  }

  if (appliedTabBehaviorEqual(previous, next)) {
    return 'skipped';
  }

  try {
    await writeState(tabId, next, store);
    await apply(tabId, next, deps.tabs, { ignoreNoReceiver: false });
    return 'applied';
  } catch {
    try {
      await writeState(tabId, previous, store);
    } catch {
      // Rollback is best-effort; the tab still counts as a reapply failure.
    }
    return 'failed';
  }
}

export async function reapplyBehaviorSettings(
  request: ReapplyBehaviorRequest,
  deps: ReapplyBehaviorSettingsDeps = {},
): Promise<ReapplyResult> {
  if (request.scope.kind === 'global' && request.change.field === 'speed') {
    return { reappliedTabs: 0, reapplyFailures: 0 };
  }

  let discovered: chrome.tabs.Tab[];
  try {
    discovered = await (deps.queryTabs ?? (() => chrome.tabs.query({})))();
  } catch (error) {
    return {
      reappliedTabs: 0,
      reapplyFailures: 0,
      reapplyError: failureMessage(error),
    };
  }

  const enqueue = deps.enqueue ?? enqueueTabMutation;
  let reappliedTabs = 0;
  let reapplyFailures = 0;
  await Promise.all(
    discovered
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map(async (tab) => {
        try {
          const outcome = await enqueue(tab.id, () => reapplyOneTab(tab.id, request, deps));
          if (outcome === 'applied') {
            reappliedTabs += 1;
          } else if (outcome === 'failed') {
            reapplyFailures += 1;
          }
        } catch (error) {
          void error;
          reapplyFailures += 1;
        }
      }),
  );
  return { reappliedTabs, reapplyFailures };
}
