// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { intentFailureMessage, isExtensionRequest } from '../core/messages';
import { tabBehavior } from './tab-behavior-fixture';

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
    expect(isExtensionRequest({ type: 'APPLY_TAB_BEHAVIOR', behavior: tabBehavior(1.5) })).toBe(
      true,
    );
    expect(isExtensionRequest({ type: 'APPLY_TAB_BEHAVIOR', behavior: { targetSpeed: 1.5 } })).toBe(
      false,
    );
    expect(
      isExtensionRequest({
        type: 'APPLY_TAB_BEHAVIOR',
        behavior: { ...tabBehavior(1.5), overlayPosition: 'top-center' },
      }),
    ).toBe(false);
    expect(
      isExtensionRequest({
        type: 'APPLY_TAB_BEHAVIOR',
        behavior: { ...tabBehavior(1.5), overlayPosition: 9 },
      }),
    ).toBe(false);
    expect(
      isExtensionRequest({
        type: 'APPLY_TAB_BEHAVIOR',
        behavior: { ...tabBehavior(Number.POSITIVE_INFINITY) },
      }),
    ).toBe(false);
    expect(
      isExtensionRequest({
        type: 'APPLY_TAB_BEHAVIOR',
        behavior: { ...tabBehavior(1.5), overlayAutoHide: 'yes' },
      }),
    ).toBe(false);
    expect(
      isExtensionRequest({
        type: 'APPLY_TAB_BEHAVIOR',
        behavior: { ...tabBehavior(1.5), overlayAutoHideDelayMs: Number.NaN },
      }),
    ).toBe(false);
    expect(isExtensionRequest({ type: 'APPLY_TAB_BEHAVIOR', targetSpeed: 1.5 })).toBe(false);
    expect(
      isExtensionRequest({ type: 'RECONCILE_ACCESS', allowedHostPatterns: ['https://*/*'] }),
    ).toBe(true);
    expect(isExtensionRequest({ type: 'RECONCILE_ACCESS', allowedHostPatterns: [1] })).toBe(false);
    expect(isExtensionRequest({ type: 'ADJUST_SPEED', direction: -1 })).toBe(true);
    expect(isExtensionRequest({ type: 'ADJUST_SPEED', direction: 1 })).toBe(true);
    expect(isExtensionRequest({ type: 'ADJUST_SPEED', direction: 0 })).toBe(false);
    expect(isExtensionRequest({ type: 'ADJUST_SPEED', direction: 2 })).toBe(false);
    expect(isExtensionRequest({ type: 'ADJUST_SPEED', direction: '1' })).toBe(false);
    expect(isExtensionRequest({ type: 'ADJUST_SPEED', direction: null })).toBe(false);
    expect(isExtensionRequest({ type: 'SET_OVERLAY_POSITION', position: 8 })).toBe(true);
    expect(isExtensionRequest({ type: 'SET_OVERLAY_POSITION', position: 9 })).toBe(false);
    expect(isExtensionRequest({ type: 'SET_OVERLAY_POSITION' })).toBe(false);
    expect(isExtensionRequest({ type: 'OPEN_OPTIONS_PAGE' })).toBe(true);
    expect(isExtensionRequest({ type: 'OPEN_OPTIONS_PAGE', extra: true })).toBe(false);
    expect(isExtensionRequest({ type: 'UNKNOWN' })).toBe(false);
    expect(isExtensionRequest({ type: 'GET_BEHAVIOR_SETTINGS' })).toBe(true);
    expect(isExtensionRequest({ type: 'GET_CUSTOM_SITES' })).toBe(true);
    expect(isExtensionRequest({ type: 'GET_CUSTOM_SITES', extra: true })).toBe(false);
    expect(isExtensionRequest({ type: 'GET_BEHAVIOR_SETTINGS', hostname: 'example.com' })).toBe(
      true,
    );
    expect(
      isExtensionRequest({
        type: 'GET_BEHAVIOR_SETTINGS',
        hostname: 'example.com',
        extra: true,
      }),
    ).toBe(false);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
      }),
    ).toBe(true);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global', hostname: 'example.com' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
      }),
    ).toBe(false);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'speed', value: 1.5 },
        extra: true,
      }),
    ).toBe(false);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'site', hostname: 'example.com' },
        change: { kind: 'inherit', field: 'overlayPosition', value: 8 },
      }),
    ).toBe(false);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayVisible', value: false },
      }),
    ).toBe(true);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayPositionButton', value: false },
      }),
    ).toBe(true);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlaySettingsButton', value: true },
      }),
    ).toBe(true);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'overlayHoverHold', value: false },
      }),
    ).toBe(true);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'speedTick', value: 0.05 },
      }),
    ).toBe(true);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        changes: [
          { kind: 'value', field: 'speed', value: 1.25 },
          { kind: 'value', field: 'overlayVisible', value: false },
        ],
      }),
    ).toBe(true);
    expect(
      isExtensionRequest({
        type: 'SET_BEHAVIOR_SETTING',
        scope: { kind: 'global' },
        change: { kind: 'value', field: 'speed', value: 1.25 },
        changes: [{ kind: 'value', field: 'speed', value: 1.5 }],
      }),
    ).toBe(false);
    expect(isExtensionRequest({ type: 'DELETE_SITE_SETTINGS', hostname: 'example.com' })).toBe(
      true,
    );
    expect(
      isExtensionRequest({
        type: 'DELETE_SITE_SETTINGS',
        hostname: 'example.com',
        extra: true,
      }),
    ).toBe(false);
    expect(isExtensionRequest({ type: 'RESET_GLOBAL_BEHAVIOR' })).toBe(true);
    expect(
      isExtensionRequest({ type: 'RESET_ALL_BEHAVIOR', snapshotHostname: 'example.com' }),
    ).toBe(true);
    expect(isExtensionRequest({ type: 'RESET_ALL_BEHAVIOR', snapshotHostname: 1 })).toBe(false);
  });
});

describe('intentFailureMessage', () => {
  it('reports resolved application failures and warnings', () => {
    expect(intentFailureMessage({ ok: false, error: 'Missing tab' })).toBe('Missing tab');
    expect(intentFailureMessage({ ok: false })).toBe('Request failed');
    expect(
      intentFailureMessage({ ok: true, reapplyError: 'Failed to apply overlay position' }),
    ).toBe('Failed to apply overlay position');
    expect(intentFailureMessage({ ok: true, persistError: 'quota' })).toBe('quota');
    expect(intentFailureMessage({ ok: true, targetSpeed: 1.25 })).toBeNull();
    expect(intentFailureMessage(undefined)).toBe('Invalid response');
  });
});
