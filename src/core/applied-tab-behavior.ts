// SPDX-License-Identifier: GPL-3.0-only

import { speedPolicyFrom, type SpeedPolicy } from './speed';
import {
  BUILT_IN_SITE_BEHAVIOR,
  canonicalizeOverlayAutoHideDelayMs,
  isOverlayPosition,
  type OverlayPosition,
  type SiteBehavior,
} from '../settings/site-behavior';

export type AppliedTabBehavior = {
  targetSpeed: number;
  speedMin: number;
  speedMax: number;
  speedTick: number;
  overlayVisible: boolean;
  overlayPosition: OverlayPosition;
  overlayPositionButton: boolean;
  overlaySettingsButton: boolean;
  overlayAutoHide: boolean;
  overlayHoverHold: boolean;
  overlayAutoHideDelayMs: number;
};

const APPLIED_TAB_BEHAVIOR_KEYS = [
  'targetSpeed',
  'speedMin',
  'speedMax',
  'speedTick',
  'overlayVisible',
  'overlayPosition',
  'overlayPositionButton',
  'overlaySettingsButton',
  'overlayAutoHide',
  'overlayHoverHold',
  'overlayAutoHideDelayMs',
] as const;

export function toAppliedTabBehavior(
  effective: SiteBehavior,
  targetSpeed = effective.speed,
): AppliedTabBehavior {
  return {
    targetSpeed,
    speedMin: effective.speedMin,
    speedMax: effective.speedMax,
    speedTick: effective.speedTick,
    overlayVisible: effective.overlayVisible,
    overlayPosition: effective.overlayPosition,
    overlayPositionButton: effective.overlayPositionButton,
    overlaySettingsButton: effective.overlaySettingsButton,
    overlayAutoHide: effective.overlayAutoHide,
    overlayHoverHold: effective.overlayHoverHold,
    overlayAutoHideDelayMs: canonicalizeOverlayAutoHideDelayMs(effective.overlayAutoHideDelayMs),
  };
}

export function builtInAppliedTabBehavior(targetSpeed?: number): AppliedTabBehavior {
  return toAppliedTabBehavior(BUILT_IN_SITE_BEHAVIOR, targetSpeed);
}

export function appliedTabBehaviorEqual(
  left: AppliedTabBehavior,
  right: AppliedTabBehavior,
): boolean {
  return (
    left.targetSpeed === right.targetSpeed &&
    left.speedMin === right.speedMin &&
    left.speedMax === right.speedMax &&
    left.speedTick === right.speedTick &&
    left.overlayVisible === right.overlayVisible &&
    left.overlayPosition === right.overlayPosition &&
    left.overlayPositionButton === right.overlayPositionButton &&
    left.overlaySettingsButton === right.overlaySettingsButton &&
    left.overlayAutoHide === right.overlayAutoHide &&
    left.overlayHoverHold === right.overlayHoverHold &&
    left.overlayAutoHideDelayMs === right.overlayAutoHideDelayMs
  );
}

export function nonTargetBehaviorFrom(
  behavior: AppliedTabBehavior,
): Omit<AppliedTabBehavior, 'targetSpeed'> {
  return {
    speedMin: behavior.speedMin,
    speedMax: behavior.speedMax,
    speedTick: behavior.speedTick,
    overlayVisible: behavior.overlayVisible,
    overlayPosition: behavior.overlayPosition,
    overlayPositionButton: behavior.overlayPositionButton,
    overlaySettingsButton: behavior.overlaySettingsButton,
    overlayAutoHide: behavior.overlayAutoHide,
    overlayHoverHold: behavior.overlayHoverHold,
    overlayAutoHideDelayMs: behavior.overlayAutoHideDelayMs,
  };
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
    typeof record.speedMin === 'number' &&
    Number.isFinite(record.speedMin) &&
    typeof record.speedMax === 'number' &&
    Number.isFinite(record.speedMax) &&
    typeof record.speedTick === 'number' &&
    Number.isFinite(record.speedTick) &&
    isOverlayPosition(record.overlayPosition) &&
    typeof record.overlayVisible === 'boolean' &&
    typeof record.overlayPositionButton === 'boolean' &&
    typeof record.overlaySettingsButton === 'boolean' &&
    typeof record.overlayAutoHide === 'boolean' &&
    typeof record.overlayHoverHold === 'boolean' &&
    typeof record.overlayAutoHideDelayMs === 'number' &&
    Number.isFinite(record.overlayAutoHideDelayMs)
  );
}
