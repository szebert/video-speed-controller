// SPDX-License-Identifier: GPL-3.0-only

export type SpeedPolicy = {
  tick: number;
  min: number;
  max: number;
};

/** Chromium `HTMLMediaElement.kMinPlaybackRate`. Values below this throw. */
export const SPEED_MIN_SETTING_MIN = 0.0625;
export const SPEED_MIN_SETTING_MAX = 1;
export const SPEED_MAX_SETTING_MIN = 2;
/** Chromium `HTMLMediaElement.kMaxPlaybackRate`. Values above this throw. */
export const SPEED_MAX_SETTING_MAX = 16;
/** Faster/Slower increment. Independent of the playbackRate floor. */
export const SPEED_TICK_SETTING_MIN = 0.01;
export const SPEED_TICK_SETTING_MAX = 1;
const SPEED_CANONICAL_SCALE = 10_000;
export const SPEED_SLIDER_STEP = 0.01;

export const DEFAULT_SPEED_POLICY: SpeedPolicy = {
  tick: 0.25,
  min: 0.25,
  max: 4,
};

export function speedPolicyFrom(range: Pick<SpeedPolicy, 'min' | 'max' | 'tick'>): SpeedPolicy {
  return {
    tick: canonicalizeSpeed(range.tick),
    min: canonicalizeSpeed(range.min),
    max: canonicalizeSpeed(range.max),
  };
}

export function clampPolicyNumber(value: number, min: number, max: number): number {
  return canonicalizeSpeed(Math.min(max, Math.max(min, value)));
}

export function canonicalizeSpeed(speed: number): number {
  if (!Number.isFinite(speed)) {
    throw new Error('Speed must be a finite number');
  }
  return Math.round(speed * SPEED_CANONICAL_SCALE) / SPEED_CANONICAL_SCALE;
}

export function clampSpeed(speed: number, policy: SpeedPolicy = DEFAULT_SPEED_POLICY): number {
  return Math.min(policy.max, Math.max(policy.min, speed));
}

export function resolveEffectiveSpeed(
  siteSpeed: number | null | undefined,
  policy: SpeedPolicy = DEFAULT_SPEED_POLICY,
): number {
  if (siteSpeed == null || !Number.isFinite(siteSpeed)) {
    return canonicalizeSpeed(1);
  }
  return canonicalizeSpeed(clampSpeed(siteSpeed, policy));
}

export function adjustSpeed(
  current: number,
  direction: 1 | -1,
  policy: SpeedPolicy = DEFAULT_SPEED_POLICY,
): number {
  return canonicalizeSpeed(clampSpeed(current + direction * policy.tick, policy));
}

export function canAdjustSpeed(
  current: number,
  direction: 1 | -1,
  policy: SpeedPolicy = DEFAULT_SPEED_POLICY,
): boolean {
  return adjustSpeed(current, direction, policy) !== canonicalizeSpeed(current);
}

export function isPolicyLimited(
  siteSpeed: number | null | undefined,
  policy: SpeedPolicy = DEFAULT_SPEED_POLICY,
): boolean {
  if (siteSpeed == null || !Number.isFinite(siteSpeed)) {
    return false;
  }
  return canonicalizeSpeed(siteSpeed) !== resolveEffectiveSpeed(siteSpeed, policy);
}

export function displaySpeed(input: {
  siteAccess: boolean;
  siteSpeed: number | null;
  tabTarget: number | null;
  policy?: SpeedPolicy;
}): number {
  const policy = input.policy ?? DEFAULT_SPEED_POLICY;
  if (!input.siteAccess) {
    return input.siteSpeed == null ? 1 : canonicalizeSpeed(input.siteSpeed);
  }
  if (input.tabTarget != null) {
    return canonicalizeSpeed(input.tabTarget);
  }
  return resolveEffectiveSpeed(input.siteSpeed, policy);
}

export function formatSpeed(speed: number): string {
  const value = canonicalizeSpeed(speed);
  const [whole, fraction = ''] = value.toFixed(4).replace(/0+$/, '').split('.');
  return `${whole}.${fraction.padEnd(2, '0')}×`;
}

export function sliderBounds(policy: SpeedPolicy = DEFAULT_SPEED_POLICY): {
  minValue: number;
  maxValue: number;
} {
  const min = canonicalizeSpeed(policy.min);
  const max = canonicalizeSpeed(policy.max);
  if (max <= min) {
    return { minValue: min, maxValue: max };
  }
  const steps = Math.max(1, Math.ceil(canonicalizeSpeed((max - min) / SPEED_SLIDER_STEP)));
  return {
    minValue: canonicalizeSpeed(max - steps * SPEED_SLIDER_STEP),
    maxValue: max,
  };
}

export function snapSliderSpeed(speed: number, policy: SpeedPolicy = DEFAULT_SPEED_POLICY): number {
  const min = canonicalizeSpeed(policy.min);
  const max = canonicalizeSpeed(policy.max);
  const clamped = canonicalizeSpeed(Math.min(max, Math.max(min, speed)));
  if (clamped <= min || clamped >= max) {
    return clamped;
  }
  const aligned = canonicalizeSpeed(Math.round(clamped / SPEED_SLIDER_STEP) * SPEED_SLIDER_STEP);
  return canonicalizeSpeed(Math.min(max, Math.max(min, aligned)));
}

export function sliderValue(speed: number, policy: SpeedPolicy = DEFAULT_SPEED_POLICY): number {
  const { minValue, maxValue } = sliderBounds(policy);
  const snapped = snapSliderSpeed(speed, policy);
  if (snapped <= canonicalizeSpeed(policy.min)) {
    return minValue;
  }
  if (snapped >= canonicalizeSpeed(policy.max)) {
    return maxValue;
  }
  return snapped;
}
