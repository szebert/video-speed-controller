// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { getPopupState } from '../background/popup-state';
import {
  resolveAppliedSpeed,
  resolveSiteBehavior,
  type BehaviorOverrides,
} from '../settings/site-behavior';

function appliedFrom(globalOverrides: BehaviorOverrides, siteOverrides: BehaviorOverrides) {
  const resolved = resolveSiteBehavior(globalOverrides, siteOverrides);
  return {
    resolved,
    targetSpeed: resolveAppliedSpeed(globalOverrides, siteOverrides, resolved),
    speedOverrideKind: siteOverrides.speed?.kind ?? ('missing' as const),
  };
}

describe('getPopupState', () => {
  it('exposes the applied seed target rather than ordinary resolved speed', async () => {
    const applied = appliedFrom({}, { speed: { kind: 'value', value: 1.25, updatedAt: 1 } });
    const resolveApplied = vi.fn(async () => applied);
    const result = await getPopupState(4, 'https://www.youtube.com/watch', {
      resolveApplied,
      readTabState: async () => null,
      hasAccess: async () => false,
    });
    expect(resolveApplied).toHaveBeenCalledTimes(1);
    expect(resolveApplied).toHaveBeenCalledWith('https://www.youtube.com/watch', {
      touchUsage: false,
    });
    expect(result).toMatchObject({
      supported: true,
      hostname: 'www.youtube.com',
      seedTarget: 1.25,
      tabTarget: null,
      siteAccess: false,
    });
  });

  it('uses defaultSpeed when remember-last is off even if stored current is 2×', async () => {
    const applied = appliedFrom(
      { rememberLastSpeed: { kind: 'value', value: false, updatedAt: 1 } },
      {
        speed: { kind: 'value', value: 2, updatedAt: 1 },
        defaultSpeed: { kind: 'value', value: 1, updatedAt: 1 },
      },
    );
    const result = await getPopupState(4, 'https://www.youtube.com/watch', {
      resolveApplied: async () => applied,
      readTabState: async () => null,
      hasAccess: async () => true,
    });
    expect(applied.targetSpeed).toBe(1);
    expect(result.seedTarget).toBe(1);
  });

  it('uses default after a site speed inherit even if global current is 2×', async () => {
    const applied = appliedFrom(
      { speed: { kind: 'value', value: 2, updatedAt: 1 } },
      { speed: { kind: 'inherit', updatedAt: 2 } },
    );
    const result = await getPopupState(4, 'https://www.youtube.com/watch', {
      resolveApplied: async () => applied,
      readTabState: async () => null,
      hasAccess: async () => true,
    });
    expect(applied.targetSpeed).toBe(1);
    expect(result.seedTarget).toBe(1);
  });
});
