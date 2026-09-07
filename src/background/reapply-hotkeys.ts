// SPDX-License-Identifier: GPL-3.0-only

import type { BehaviorSettingsScope, ReapplyResult } from '../protocol/schemas/shared';
import { getSiteKey } from '../storage/site-key';
import { getTabState, listTargetedTabIds, type TabStateStore } from '../storage/tab-state';
import { enqueueTabMutation } from './tab-mutation-queue';
import { readAppliedTabPayload } from './applied-behavior';
import { applyTabBehavior, type TabMessenger } from './broadcast';

export type ReapplyHotkeysDeps = {
  listTabIds?: () => Promise<number[]>;
  getTab?: (tabId: number) => Promise<chrome.tabs.Tab>;
  getTabState?: typeof getTabState;
  readPayload?: typeof readAppliedTabPayload;
  apply?: typeof applyTabBehavior;
  enqueue?: typeof enqueueTabMutation;
  tabStateStore?: TabStateStore;
  tabs?: TabMessenger;
};

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function reapplyHotkeysToTabs(
  scope: BehaviorSettingsScope | { kind: 'all' },
  deps: ReapplyHotkeysDeps = {},
): Promise<ReapplyResult> {
  let discovered: number[];
  try {
    discovered = await (deps.listTabIds ?? (() => listTargetedTabIds(deps.tabStateStore)))();
  } catch (error) {
    return {
      reappliedTabs: 0,
      reapplyFailures: 0,
      reapplyError: failureMessage(error),
    };
  }

  const enqueue = deps.enqueue ?? enqueueTabMutation;
  const readState = deps.getTabState ?? getTabState;
  const readTab = deps.getTab ?? ((id: number) => chrome.tabs.get(id));
  const readPayload = deps.readPayload ?? readAppliedTabPayload;
  const apply = deps.apply ?? applyTabBehavior;
  const store = deps.tabStateStore;
  let reappliedTabs = 0;
  let reapplyFailures = 0;

  await Promise.all(
    discovered.map(async (tabId) => {
      try {
        const outcome = await enqueue(tabId, async () => {
          const previous = await readState(tabId, store);
          if (!previous) {
            return 'skipped' as const;
          }
          let tab: chrome.tabs.Tab;
          try {
            tab = await readTab(tabId);
          } catch {
            return 'failed' as const;
          }
          const url = tab.url;
          if (!url) {
            return 'skipped' as const;
          }
          const key = getSiteKey(url);
          if (!key.supported) {
            return 'skipped' as const;
          }
          if (scope.kind === 'site' && key.hostname !== scope.hostname) {
            return 'skipped' as const;
          }
          const payload = await readPayload(url, { touchUsage: false });
          await apply(tabId, previous, deps.tabs, {
            ignoreNoReceiver: false,
            hotkeys: payload.hotkeys,
          });
          return 'applied' as const;
        });
        if (outcome === 'applied') {
          reappliedTabs += 1;
        } else if (outcome === 'failed') {
          reapplyFailures += 1;
        }
      } catch {
        reapplyFailures += 1;
      }
    }),
  );

  return { reappliedTabs, reapplyFailures };
}
