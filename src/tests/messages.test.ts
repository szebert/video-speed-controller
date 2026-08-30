// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { isExtensionRequest } from '../core/messages';

describe('isExtensionRequest', () => {
  it('requires a complete payload for each message type', () => {
    expect(isExtensionRequest({ type: 'RESET_SITE_SPEED' })).toBe(false);
    expect(
      isExtensionRequest({ type: 'GET_POPUP_STATE', tabId: 1, url: 'https://a.example' }),
    ).toBe(true);
    expect(isExtensionRequest({ type: 'ENABLE_SITE', tabId: -1, url: 'https://a.example' })).toBe(
      false,
    );
    expect(isExtensionRequest({ type: 'SET_SPEED', tabId: 1, url: 'https://a.example' })).toBe(
      false,
    );
    expect(
      isExtensionRequest({ type: 'SET_SPEED', tabId: 1, url: 'https://a.example', speed: 1.25 }),
    ).toBe(true);
    expect(isExtensionRequest({ type: 'FRAME_READY' })).toBe(true);
    expect(isExtensionRequest({ type: 'TOP_FRAME_DESTROYED' })).toBe(true);
    expect(isExtensionRequest({ type: 'APPLY_TAB_TARGET', targetSpeed: 1.5 })).toBe(true);
    expect(isExtensionRequest({ type: 'APPLY_TAB_TARGET', targetSpeed: Number.NaN })).toBe(false);
    expect(
      isExtensionRequest({ type: 'RECONCILE_ACCESS', allowedHostPatterns: ['https://*/*'] }),
    ).toBe(true);
    expect(isExtensionRequest({ type: 'RECONCILE_ACCESS', allowedHostPatterns: [1] })).toBe(false);
    expect(isExtensionRequest({ type: 'UNKNOWN' })).toBe(false);
  });
});
