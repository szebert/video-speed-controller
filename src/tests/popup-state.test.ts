// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { getPopupState } from '../background/popup-state';
import { OVERLAY_POSITION } from '../settings/site-behavior';

describe('getPopupState', () => {
  it('resolves site behavior once and derives speed plus policy from it', async () => {
    const resolveBehavior = vi.fn(async () => ({
      speed: { value: 1.25, source: 'site' as const },
      speedMin: { value: 0.5, source: 'site' as const },
      speedMax: { value: 3, source: 'global' as const },
      speedTick: { value: 0.1, source: 'built-in' as const },
      overlayVisible: { value: true, source: 'built-in' as const },
      overlayPosition: { value: OVERLAY_POSITION.TOP_CENTER, source: 'built-in' as const },
      overlayPositionButton: { value: true, source: 'built-in' as const },
      overlaySettingsButton: { value: true, source: 'built-in' as const },
      overlayAutoHide: { value: true, source: 'built-in' as const },
      overlayHoverHold: { value: false, source: 'built-in' as const },
      overlayAutoHideDelayMs: { value: 2000, source: 'built-in' as const },
      hotkeys: {},
    }));
    const result = await getPopupState(4, 'https://www.youtube.com/watch', {
      resolveBehavior,
      readTabState: async () => null,
      hasAccess: async () => false,
    });
    expect(resolveBehavior).toHaveBeenCalledTimes(1);
    expect(resolveBehavior).toHaveBeenCalledWith('https://www.youtube.com/watch', {
      touchUsage: false,
    });
    expect(result).toMatchObject({
      supported: true,
      hostname: 'www.youtube.com',
      siteSpeed: 1.25,
      tabTarget: null,
      siteAccess: false,
      speedMin: 0.5,
      speedMax: 3,
      speedTick: 0.1,
    });
  });
});
