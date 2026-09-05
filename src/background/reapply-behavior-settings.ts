// SPDX-License-Identifier: GPL-3.0-only

import {
  appliedTabBehaviorEqual,
  nonTargetBehaviorFrom,
  speedPolicyFromApplied,
  type AppliedTabBehavior,
} from '../core/applied-tab-behavior';
import { resolveEffectiveSpeed } from '../core/speed';
import type { BehaviorSettingsScope, ReapplyResult } from '../protocol/schemas/shared';
import { BEHAVIOR_FIELDS, type ReapplyMode } from '../settings/behavior-fields';
import type { EditableBehaviorField } from '../settings/site-behavior';
import { getSiteKey } from '../storage/site-key';
import {
  getTabState,
  listTargetedTabIds,
  setTabState,
  type TabStateStore,
} from '../storage/tab-state';
import { enqueueTabMutation } from './tab-mutation-queue';
import { applyTabBehavior, type TabMessenger } from './broadcast';
import { readAppliedTabBehavior } from './applied-behavior';

export type { ReapplyMode };

export type ReapplyBehaviorSettingsDeps = {
  listTabIds?: () => Promise<number[]>;
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
  mode: ReapplyMode;
};

export function reapplyModeForField(
  scope: 'global' | 'site',
  field: EditableBehaviorField,
): ReapplyMode {
  return BEHAVIOR_FIELDS[field].reapply[scope];
}

const REAPPLY_MODE_RANK: Record<ReapplyMode, number> = {
  none: 0,
  'preserve-target': 1,
  'revalidate-target': 2,
  'resolve-target': 3,
};

export function reapplyModeForFields(
  scope: 'global' | 'site',
  changes: readonly { field: EditableBehaviorField }[],
): ReapplyMode {
  let best: ReapplyMode = 'none';
  for (const change of changes) {
    const mode = reapplyModeForField(scope, change.field);
    if (REAPPLY_MODE_RANK[mode] > REAPPLY_MODE_RANK[best]) {
      best = mode;
    }
  }
  return best;
}

type TabOutcome = 'applied' | 'skipped' | 'failed';

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nextBehavior(
  previous: AppliedTabBehavior,
  fresh: AppliedTabBehavior,
  mode: Exclude<ReapplyMode, 'none'>,
): AppliedTabBehavior {
  if (mode === 'resolve-target') {
    return fresh;
  }
  if (mode === 'preserve-target') {
    return { ...previous, ...nonTargetBehaviorFrom(fresh), targetSpeed: previous.targetSpeed };
  }
  return {
    ...fresh,
    targetSpeed: resolveEffectiveSpeed(previous.targetSpeed, speedPolicyFromApplied(fresh)),
  };
}

async function reapplyOneTab(
  tabId: number,
  request: ReapplyBehaviorRequest,
  deps: ReapplyBehaviorSettingsDeps,
): Promise<TabOutcome> {
  if (request.mode === 'none') {
    return 'skipped';
  }
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
    next = nextBehavior(previous, fresh, request.mode);
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
  if (request.mode === 'none') {
    return { reappliedTabs: 0, reapplyFailures: 0 };
  }

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
  let reappliedTabs = 0;
  let reapplyFailures = 0;
  await Promise.all(
    discovered.map(async (tabId) => {
      try {
        const outcome = await enqueue(tabId, () => reapplyOneTab(tabId, request, deps));
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
