// SPDX-License-Identifier: GPL-3.0-only

import type { Equal } from '../types/equal';
import {
  BEHAVIOR_FIELDS,
  EDITABLE_BEHAVIOR_FIELDS,
  type BehaviorField,
} from '../settings/behavior-fields';
import {
  BUILT_IN_SITE_BEHAVIOR,
  canonicalizeOverlayAutoHideDelayMs,
  isOverlayPosition,
  type SiteBehavior,
} from '../settings/site-behavior';
import { speedPolicyFrom, type SpeedPolicy } from './speed';

// Session/tab shape derived from BEHAVIOR_FIELDS (speed → targetSpeed, no
// hotkeys). The Mini APPLY schema lists the same keys separately so overlay
// never imports Zod.
export type AppliedTabBehavior = {
  [K in Exclude<BehaviorField, 'speed'> | 'targetSpeed']: K extends 'targetSpeed'
    ? number
    : SiteBehavior[Extract<K, BehaviorField>];
};

true satisfies Equal<keyof AppliedTabBehavior, 'targetSpeed' | Exclude<BehaviorField, 'speed'>>;

const APPLIED_TAB_BEHAVIOR_KEYS = [
  'targetSpeed',
  ...EDITABLE_BEHAVIOR_FIELDS.filter(
    (field): field is Exclude<BehaviorField, 'speed'> => field !== 'speed',
  ),
] as const satisfies readonly (keyof AppliedTabBehavior)[];

function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const next = { ...value };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

export function toAppliedTabBehavior(
  effective: SiteBehavior,
  targetSpeed = effective.speed,
): AppliedTabBehavior {
  const fields = omit(effective, ['speed', 'hotkeys']);
  return {
    ...fields,
    targetSpeed,
    overlayAutoHideDelayMs: canonicalizeOverlayAutoHideDelayMs(fields.overlayAutoHideDelayMs),
  };
}

export function builtInAppliedTabBehavior(targetSpeed?: number): AppliedTabBehavior {
  return toAppliedTabBehavior(BUILT_IN_SITE_BEHAVIOR, targetSpeed);
}

export function appliedTabBehaviorEqual(
  left: AppliedTabBehavior,
  right: AppliedTabBehavior,
): boolean {
  return APPLIED_TAB_BEHAVIOR_KEYS.every((key) => left[key] === right[key]);
}

export function nonTargetBehaviorFrom(
  behavior: AppliedTabBehavior,
): Omit<AppliedTabBehavior, 'targetSpeed'> {
  return omit(behavior, ['targetSpeed']);
}

export function speedPolicyFromApplied(
  behavior: Pick<AppliedTabBehavior, 'speedMin' | 'speedMax' | 'speedTick'>,
): SpeedPolicy {
  return speedPolicyFrom({
    min: behavior.speedMin,
    max: behavior.speedMax,
    tick: behavior.speedTick,
  });
}

function isAppliedFieldValue(key: keyof AppliedTabBehavior, value: unknown): boolean {
  if (key === 'targetSpeed') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (key === 'overlayPosition') {
    return isOverlayPosition(value);
  }
  const defaultValue = BEHAVIOR_FIELDS[key].default;
  return (
    typeof value === typeof defaultValue && (typeof value !== 'number' || Number.isFinite(value))
  );
}

// Exact-key session/tab-state guard. Do not replace with
// AppliedTabBehaviorSchema: that schema is Mini, strips extra keys, and this
// file cannot import Zod.
export function isAppliedTabBehavior(value: unknown): value is AppliedTabBehavior {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    keys.length === APPLIED_TAB_BEHAVIOR_KEYS.length &&
    APPLIED_TAB_BEHAVIOR_KEYS.every((key) => key in record && isAppliedFieldValue(key, record[key]))
  );
}
