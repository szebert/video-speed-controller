// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { parseBackgroundToContent } from '../protocol/content-codec/background-content';
import {
  intentOutcomeFailureMessage,
  parseIntentOutcome,
} from '../protocol/content-codec/content-responses';
import { inboundChannel, parseBackgroundInbound } from '../protocol/schemas/background-inbound';
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
      type: 'SET_BEHAVIOR_SETTING',
      scope: { kind: 'global' },
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
      change: { kind: 'inherit', field: 'overlayPosition' },
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

  it('classifies inbound types by channel', () => {
    expect(inboundChannel('GET_POPUP_STATE')).toBe('popup');
    expect(inboundChannel('SET_BEHAVIOR_SETTING')).toBe('options');
    expect(inboundChannel('ADJUST_SPEED')).toBe('content');
    expect(inboundChannel('APPLY_TAB_BEHAVIOR')).toBeNull();
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

describe('parseIntentOutcome', () => {
  it('reports resolved application failures and rejects unknown objects', () => {
    expect(parseIntentOutcome({ ok: false, error: 'Missing tab' })).toEqual({
      ok: false,
      error: 'Missing tab',
    });
    expect(parseIntentOutcome({ ok: false })).toEqual({ ok: false, error: 'Request failed' });
    expect(
      intentOutcomeFailureMessage({
        ok: true,
        reapplyError: 'Failed to apply overlay position',
      }),
    ).toBe('Failed to apply overlay position');
    expect(intentOutcomeFailureMessage({ ok: true, persistError: 'quota' })).toBe('quota');
    expect(intentOutcomeFailureMessage({ ok: true })).toBeNull();
    expect(parseIntentOutcome({ ok: true, targetSpeed: 1.25 })).toEqual({ ok: true });
    expect(parseIntentOutcome(undefined)).toBeNull();
    expect(parseIntentOutcome({ bananas: 123 })).toBeNull();
  });
});
