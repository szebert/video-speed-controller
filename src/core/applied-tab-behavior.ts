// SPDX-License-Identifier: GPL-3.0-only

import {
  BUILT_IN_SITE_BEHAVIOR,
  isOverlayPosition,
  type OverlayPosition,
  type SiteBehavior,
} from '../settings/site-behavior';

export type AppliedTabBehavior = {
  targetSpeed: number;
  overlayPosition: OverlayPosition;
  overlayAutoHide: boolean;
  overlayAutoHideDelayMs: number;
};

const APPLIED_TAB_BEHAVIOR_KEYS = [
  'targetSpeed',
  'overlayPosition',
  'overlayAutoHide',
  'overlayAutoHideDelayMs',
] as const;

export function toAppliedTabBehavior(
  effective: SiteBehavior,
  targetSpeed = effective.speed,
): AppliedTabBehavior {
  return {
    targetSpeed,
    overlayPosition: effective.overlayPosition,
    overlayAutoHide: effective.overlayAutoHide,
    overlayAutoHideDelayMs: effective.overlayAutoHideDelayMs,
  };
}

export function builtInAppliedTabBehavior(targetSpeed?: number): AppliedTabBehavior {
  return toAppliedTabBehavior(BUILT_IN_SITE_BEHAVIOR, targetSpeed);
}

export function overlayFieldsFrom(
  behavior: Pick<
    AppliedTabBehavior,
    'overlayPosition' | 'overlayAutoHide' | 'overlayAutoHideDelayMs'
  >,
): Pick<AppliedTabBehavior, 'overlayPosition' | 'overlayAutoHide' | 'overlayAutoHideDelayMs'> {
  return {
    overlayPosition: behavior.overlayPosition,
    overlayAutoHide: behavior.overlayAutoHide,
    overlayAutoHideDelayMs: behavior.overlayAutoHideDelayMs,
  };
}

export function isAppliedTabBehavior(value: unknown): value is AppliedTabBehavior {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== APPLIED_TAB_BEHAVIOR_KEYS.length ||
    APPLIED_TAB_BEHAVIOR_KEYS.some((key) => !(key in record))
  ) {
    return false;
  }
  return (
    typeof record.targetSpeed === 'number' &&
    Number.isFinite(record.targetSpeed) &&
    isOverlayPosition(record.overlayPosition) &&
    typeof record.overlayAutoHide === 'boolean' &&
    typeof record.overlayAutoHideDelayMs === 'number' &&
    Number.isFinite(record.overlayAutoHideDelayMs)
  );
}
