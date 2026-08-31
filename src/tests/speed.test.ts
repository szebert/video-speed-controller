// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  canAdjustSpeed,
  DEFAULT_SPEED_POLICY,
  displaySpeed,
  isPolicyLimited,
  resolveEffectiveSpeed,
} from '../core/speed';

describe('speed policy', () => {
  it('keeps stored siteSpeed 5 when max is 4 and only resolves effective 4', () => {
    const stored = 5;
    expect(resolveEffectiveSpeed(stored, DEFAULT_SPEED_POLICY)).toBe(4);
    expect(stored).toBe(5);
    expect(isPolicyLimited(5, DEFAULT_SPEED_POLICY)).toBe(true);
  });

  it('does not treat an independent tabTarget as policyLimited', () => {
    expect(isPolicyLimited(3, { ...DEFAULT_SPEED_POLICY, max: 4 })).toBe(false);
    expect(
      displaySpeed({
        siteAccess: true,
        siteSpeed: 3,
        tabTarget: 2,
      }),
    ).toBe(2);
  });

  it('uses stored siteSpeed when there is no site access', () => {
    expect(displaySpeed({ siteAccess: false, siteSpeed: 2.25, tabTarget: 2.25 })).toBe(2.25);
    expect(displaySpeed({ siteAccess: false, siteSpeed: 3.25, tabTarget: null })).toBe(3.25);
    expect(displaySpeed({ siteAccess: false, siteSpeed: null, tabTarget: 2 })).toBe(1);
  });

  it('resolves from siteSpeed when access exists but tabTarget does not', () => {
    expect(displaySpeed({ siteAccess: true, siteSpeed: 5, tabTarget: null })).toBe(4);
  });

  it('disables adjust at the policy min and max', () => {
    expect(canAdjustSpeed(0.25, -1)).toBe(false);
    expect(canAdjustSpeed(0.25, 1)).toBe(true);
    expect(canAdjustSpeed(4, 1)).toBe(false);
    expect(canAdjustSpeed(4, -1)).toBe(true);
    expect(canAdjustSpeed(2, 1, { ...DEFAULT_SPEED_POLICY, max: 2 })).toBe(false);
    expect(canAdjustSpeed(1, 1)).toBe(true);
  });
});
