// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { parseBackgroundToContent } from '../protocol/content/background-content';
import { CONTENT_TO_BACKGROUND } from '../protocol/content/content-background';
import { parseBackgroundInbound } from '../protocol/schemas/background-inbound';
import { OPTIONS_TO_BACKGROUND } from '../protocol/schemas/options-background';
import { POPUP_TO_BACKGROUND } from '../protocol/schemas/popup-background';
import { tabBehavior } from './tab-behavior-fixture';

function accepted(value: unknown): boolean {
  return parseBackgroundInbound(value) != null;
}

describe('parseBackgroundInbound', () => {
  it('requires a complete payload for each message type', () => {
    expect(accepted({ type: 'RESET_SITE_SPEED' })).toBe(false);
    expect(accepted({ type: 'GET_POPUP_STATE', tabId: 1, url: 'https://a.example' })).toBe(true);
    expect(accepted({ type: 'ENABLE_SITE', tabId: -1, url: 'https://a.example' })).toBe(false);
    expect(accepted({ type: 'SET_SPEED', tabId: 1, url: 'https://a.example' })).toBe(false);
    expect(accepted({ type: 'SET_SPEED', tabId: 1, url: 'https://a.example', speed: 1.25 })).toBe(
      true,
    );
    expect(accepted({ type: 'FRAME_READY' })).toBe(true);
    expect(accepted({ type: 'TOP_FRAME_DESTROYED' })).toBe(true);
    expect(accepted({ type: 'ADJUST_SPEED', direction: -1 })).toBe(true);
    expect(accepted({ type: 'ADJUST_SPEED', direction: 1 })).toBe(true);
    expect(accepted({ type: 'ADJUST_SPEED', direction: 0 })).toBe(false);
    expect(accepted({ type: 'ADJUST_SPEED', direction: 2 })).toBe(false);
    expect(accepted({ type: 'ADJUST_SPEED', direction: '1' })).toBe(false);
    expect(accepted({ type: 'ADJUST_SPEED', direction: null })).toBe(false);
    expect(accepted({ type: 'SET_OVERLAY_POSITION', position: 8 })).toBe(true);
    expect(accepted({ type: 'SET_OVERLAY_POSITION', position: 9 })).toBe(false);
    expect(accepted({ type: 'SET_OVERLAY_POSITION' })).toBe(false);
    expect(accepted({ type: 'OPEN_OPTIONS_PAGE' })).toBe(true);
    expect(accepted({ type: 'OPEN_OPTIONS_PAGE', extra: true })).toBe(true);
    expect(accepted({ type: 'UNKNOWN' })).toBe(false);
    expect(accepted({ type: 'GET_BEHAVIOR_SETTINGS' })).toBe(true);
    expect(accepted({ type: 'GET_CUSTOM_SITES' })).toBe(true);
    expect(accepted({ type: 'GET_CUSTOM_SITES', extra: true })).toBe(true);
    expect(accepted({ type: 'GET_BEHAVIOR_SETTINGS', hostname: 'example.com' })).toBe(true);
    expect(
      accepted({
        type: 'GET_BEHAVIOR_SETTINGS',
        hostname: 'example.com',
        extra: true,
      }),
    ).toBe(true);
    expect(
      accepted({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
      }),
    ).toBe(true);
    expect(
      parseBackgroundInbound({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global', hostname: 'example.com' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
      }),
    ).toMatchObject({
      channel: 'options',
      request: {
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
      },
    });
    expect(
      accepted({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
        extra: true,
      }),
    ).toBe(true);
    expect(
      parseBackgroundInbound({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'site', hostname: 'example.com' },
        change: { kind: 'inherit', field: 'overlayPosition', value: 8 },
      }),
    ).toMatchObject({
      request: { change: { kind: 'inherit', field: 'overlayPosition' } },
    });
    expect(
      accepted({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayVisible', value: false },
      }),
    ).toBe(true);
    expect(
      accepted({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayPositionButton', value: false },
      }),
    ).toBe(true);
    expect(
      accepted({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlaySettingsButton', value: true },
      }),
    ).toBe(true);
    expect(
      accepted({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayHoverHold', value: false },
      }),
    ).toBe(true);
    expect(
      accepted({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'speedTick', value: 0.05 },
      }),
    ).toBe(true);
    expect(
      accepted({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        changes: [
          { kind: 'value', field: 'speed', value: 1.25 },
          { kind: 'value', field: 'overlayVisible', value: false },
        ],
      }),
    ).toBe(true);
    expect(
      accepted({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'speed', value: 1.25 },
        changes: [{ kind: 'value', field: 'speed', value: 1.5 }],
      }),
    ).toBe(false);
    expect(accepted({ type: 'DELETE_SITE_SETTINGS', hostname: 'example.com' })).toBe(true);
    expect(
      accepted({
        type: 'DELETE_SITE_SETTINGS',
        hostname: 'example.com',
        extra: true,
      }),
    ).toBe(true);
    expect(accepted({ type: 'RESET_GLOBAL_BEHAVIOR' })).toBe(true);
    expect(accepted({ type: 'RESET_ALL_BEHAVIOR', snapshotHostname: 'example.com' })).toBe(true);
    expect(accepted({ type: 'RESET_ALL_BEHAVIOR', snapshotHostname: 1 })).toBe(false);
    expect(accepted({ type: 'APPLY_TAB_BEHAVIOR', behavior: tabBehavior(1.5) })).toBe(false);
  });

  it('returns the catalog channel with the parsed request', () => {
    expect(
      parseBackgroundInbound({ type: 'GET_POPUP_STATE', tabId: 1, url: 'https://a.example' }),
    ).toMatchObject({ channel: 'popup' });
    expect(
      parseBackgroundInbound({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
      }),
    ).toMatchObject({ channel: 'options' });
    expect(parseBackgroundInbound({ type: 'ADJUST_SPEED', direction: 1 })).toMatchObject({
      channel: 'content',
    });
    expect(parseBackgroundInbound({ type: 'APPLY_TAB_BEHAVIOR', behavior: tabBehavior(1.5) })).toBe(
      null,
    );
  });

  it('keeps popup, options, and content endpoint names pairwise disjoint', () => {
    const popup = new Set(Object.keys(POPUP_TO_BACKGROUND));
    const options = new Set(Object.keys(OPTIONS_TO_BACKGROUND));
    const content = new Set(Object.keys(CONTENT_TO_BACKGROUND));
    expect([...popup].filter((key) => options.has(key))).toEqual([]);
    expect([...popup].filter((key) => content.has(key))).toEqual([]);
    expect([...options].filter((key) => content.has(key))).toEqual([]);
  });
});

describe('parseBackgroundToContent', () => {
  it('accepts only apply and reconcile payloads', () => {
    expect(
      parseBackgroundToContent({ type: 'APPLY_TAB_BEHAVIOR', behavior: tabBehavior(1.5) }),
    ).toEqual({
      type: 'APPLY_TAB_BEHAVIOR',
      behavior: tabBehavior(1.5),
    });
    expect(
      parseBackgroundToContent({ type: 'APPLY_TAB_BEHAVIOR', behavior: { targetSpeed: 1.5 } }),
    ).toBe(null);
    expect(
      parseBackgroundToContent({
        type: 'APPLY_TAB_BEHAVIOR',
        behavior: tabBehavior(1.5),
        reason: 'settings-change',
      }),
    ).toMatchObject({ type: 'APPLY_TAB_BEHAVIOR' });
    expect(
      parseBackgroundToContent({ type: 'RECONCILE_ACCESS', allowedHostPatterns: ['https://*/*'] }),
    ).toEqual({
      type: 'RECONCILE_ACCESS',
      allowedHostPatterns: ['https://*/*'],
    });
    expect(parseBackgroundToContent({ type: 'RECONCILE_ACCESS', allowedHostPatterns: [1] })).toBe(
      null,
    );
    expect(parseBackgroundToContent({ type: 'ADJUST_SPEED', direction: 1 })).toBe(null);
  });
});
