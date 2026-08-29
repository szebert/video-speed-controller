// SPDX-License-Identifier: GPL-3.0-only

export type SpeedPolicy = {
  tick: number;
  min: number;
  max: number;
  sliderStep: number;
};

export const DEFAULT_SPEED_POLICY: SpeedPolicy = {
  tick: 0.25,
  min: 0.25,
  max: 4,
  sliderStep: 0.05,
};

export function canonicalizeSpeed(speed: number): number {
  if (!Number.isFinite(speed)) {
    throw new Error('Speed must be a finite number');
  }
  return Math.round(speed * 100) / 100;
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
  return `${canonicalizeSpeed(speed).toFixed(2)}×`;
}

export function snapSliderSpeed(speed: number, policy: SpeedPolicy = DEFAULT_SPEED_POLICY): number {
  const stepped = Math.round(speed / policy.sliderStep) * policy.sliderStep;
  return canonicalizeSpeed(clampSpeed(stepped, policy));
}
