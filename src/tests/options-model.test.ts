// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  applyOptimisticChange,
  applyOptimisticChanges,
  applyOptimisticHotkeyChange,
  omitMatchingOptimisticChanges,
  omitMatchingOptimisticHotkeys,
  sameBehaviorSettingChange,
} from '../entrypoints/options/options-model';
import { OVERLAY_POSITION, resolveSiteBehavior } from '../settings/site-behavior';
import type { BehaviorSettingsSnapshot } from '../protocol/schemas/shared';

function snapshot(): BehaviorSettingsSnapshot {
  const global = {
    speed: { value: 1, source: 'built-in' as const },
    speedMin: { value: 0.25, source: 'built-in' as const },
    speedMax: { value: 4, source: 'built-in' as const },
    speedTick: { value: 0.25, source: 'built-in' as const },
    overlayVisible: { value: true, source: 'built-in' as const },
    overlayPosition: { value: OVERLAY_POSITION.TOP_CENTER, source: 'built-in' as const },
    overlayPositionButton: { value: true, source: 'built-in' as const },
    overlaySettingsButton: { value: true, source: 'built-in' as const },
    overlayAutoHide: { value: true, source: 'built-in' as const },
    overlayHoverHold: { value: false, source: 'built-in' as const },
    overlayAutoHideDelayMs: { value: 2000, source: 'built-in' as const },
    overlayOpacity: { value: 70, source: 'built-in' as const },
  };
  const hotkeys = resolveSiteBehavior().hotkeys;
  return {
    global,
    globalHotkeys: hotkeys,
    site: {
      hostname: 'www.youtube.com',
      behavior: { ...global, speed: { value: 1.25, source: 'site' as const } },
      hotkeys,
    },
  };
}

describe('optimistic options state', () => {
  it('applies a site value over the persisted snapshot', () => {
    const state = snapshot();
    const next = applyOptimisticChange(
      state.site!.behavior,
      { kind: 'value', field: 'speed', value: 1.5 },
      { kind: 'site', hostname: 'www.youtube.com' },
      state,
    );
    expect(next.speed).toEqual({ value: 1.5, source: 'site' });
  });

  it('inherits a site field from global and a global field from built-in', () => {
    const state = snapshot();
    expect(
      applyOptimisticChange(
        state.site!.behavior,
        { kind: 'inherit', field: 'speed' },
        { kind: 'site', hostname: 'www.youtube.com' },
        state,
      ).speed,
    ).toEqual(state.global.speed);
    expect(
      applyOptimisticChange(
        { ...state.global, speed: { value: 1.5, source: 'global' } },
        { kind: 'inherit', field: 'speed' },
        { kind: 'global' },
        state,
      ).speed,
    ).toEqual({ value: 1, source: 'built-in' });
  });

  it('stacks pending field changes and keeps newer values when omitting a sent batch', () => {
    const state = snapshot();
    const pending = {
      speed: { kind: 'value' as const, field: 'speed' as const, value: 1.5 },
      overlayVisible: { kind: 'value' as const, field: 'overlayVisible' as const, value: false },
    };
    const displayed = applyOptimisticChanges(state.global, pending, { kind: 'global' }, state);
    expect(displayed.speed.value).toBe(1.5);
    expect(displayed.overlayVisible.value).toBe(false);
    expect(
      omitMatchingOptimisticChanges(pending, [{ kind: 'value', field: 'speed', value: 1.25 }]),
    ).toEqual(pending);
    expect(
      omitMatchingOptimisticChanges(pending, [{ kind: 'value', field: 'speed', value: 1.5 }]),
    ).toEqual({
      overlayVisible: pending.overlayVisible,
    });
    expect(
      sameBehaviorSettingChange(pending.speed, { kind: 'value', field: 'speed', value: 1.5 }),
    ).toBe(true);
  });

  it('applies optimistic hotkey value, inherit, and unbind without touching behavior fields', () => {
    const state = snapshot();
    const assigned = applyOptimisticHotkeyChange(
      state.globalHotkeys,
      {
        kind: 'hotkey-value',
        action: 'decreaseSpeed',
        value: { code: 'KeyD', ctrl: false, alt: false, shift: false, meta: false },
      },
      { kind: 'global' },
      state,
    );
    expect(assigned.decreaseSpeed).toEqual({
      value: { code: 'KeyD', ctrl: false, alt: false, shift: false, meta: false },
      source: 'global',
    });
    expect(
      applyOptimisticHotkeyChange(
        assigned,
        { kind: 'hotkey-inherit', action: 'decreaseSpeed' },
        { kind: 'global' },
        state,
      ).decreaseSpeed.source,
    ).toBe('built-in');
    expect(
      applyOptimisticHotkeyChange(
        state.site!.hotkeys,
        { kind: 'hotkey-value', action: 'resetSpeed', value: null },
        { kind: 'site', hostname: 'www.youtube.com' },
        state,
      ).resetSpeed,
    ).toEqual({ value: null, source: 'site' });
    const pending = {
      decreaseSpeed: {
        kind: 'hotkey-value' as const,
        action: 'decreaseSpeed' as const,
        value: { code: 'KeyD', ctrl: false, alt: false, shift: false, meta: false },
      },
    };
    expect(omitMatchingOptimisticHotkeys(pending, pending.decreaseSpeed)).toEqual({});
  });
});
