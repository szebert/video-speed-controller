// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  applyOptimisticChange,
  applyOptimisticChanges,
  applyOptimisticHotkeyChange,
  numberInputDraftAfterChange,
  numberInputMin,
  numberInputSteppedValue,
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
    skipBackSeconds: { value: 5, source: 'built-in' as const },
    skipForwardSeconds: { value: 10, source: 'built-in' as const },
    skipScaleWithPlaybackRate: { value: false, source: 'built-in' as const },
    rewindSpeed: { value: -1, source: 'built-in' as const },
    fastForwardSpeed: { value: 3, source: 'built-in' as const },
    overlayVisible: { value: true, source: 'built-in' as const },
    overlayPosition: { value: OVERLAY_POSITION.TOP_CENTER, source: 'built-in' as const },
    overlayPositionButton: { value: true, source: 'built-in' as const },
    overlaySettingsButton: { value: true, source: 'built-in' as const },
    overlayNavigationBar: { value: false, source: 'built-in' as const },
    overlayHotkeyHints: { value: true, source: 'built-in' as const },
    overlayAutoHide: { value: true, source: 'built-in' as const },
    overlayHoverHold: { value: false, source: 'built-in' as const },
    overlayAutoHideDelayMs: { value: 2000, source: 'built-in' as const },
    overlayOpacity: { value: 70, source: 'built-in' as const },
    hotkeyFlash: { value: true, source: 'built-in' as const },
    hotkeyFlashDelayMs: { value: 750, source: 'built-in' as const },
    hotkeyFlashOpacity: { value: 70, source: 'built-in' as const },
    hotkeyRepeat: { value: false, source: 'built-in' as const },
    hotkeyRepeatDelayMs: { value: 500, source: 'built-in' as const },
    hotkeyRepeatRate: { value: 15, source: 'built-in' as const },
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

describe('numberInputMin', () => {
  it('keeps min when it already sits on the 0-based step grid', () => {
    expect(numberInputMin(0.0625, 0.0005)).toBe(0.0625);
    expect(numberInputMin(2, 0.05)).toBe(2);
    expect(numberInputMin(0.1, 0.1)).toBe(0.1);
  });

  it('uses the previous 0-based tick when min would skew spinner values', () => {
    expect(numberInputMin(0.0625, 0.25)).toBe(0);
    expect(numberInputMin(0.1, 0.5)).toBe(0);
    expect(numberInputMin(0.25, 0.1)).toBe(0.2);
  });
});

describe('numberInputSteppedValue', () => {
  it('steps on the 0-based grid and stops at the stored minimum', () => {
    expect(numberInputSteppedValue(3, 0.0625, 16, 0.25, -1)).toBe('2.75');
    expect(numberInputSteppedValue(0.25, 0.0625, 16, 0.25, -1)).toBe('0.0625');
    expect(numberInputSteppedValue(0.0625, 0.0625, 16, 0.25, -1)).toBe('0.0625');
    expect(numberInputSteppedValue(0.0625, 0.0625, 16, 0.25, 1)).toBe('0.25');
    expect(numberInputSteppedValue(0.5, 0.1, 3600, 0.5, -1)).toBe('0.1');
  });

  it('stops at the stored maximum', () => {
    expect(numberInputSteppedValue(16, 0.0625, 16, 0.25, 1)).toBe('16');
    expect(numberInputSteppedValue(15.75, 0.0625, 16, 0.25, 1)).toBe('16');
  });
});

describe('numberInputDraftAfterChange', () => {
  it('clamps a spinner step that crossed the stored minimum', () => {
    expect(numberInputDraftAfterChange('0.25', '0', 0.0625, 16, 0.25)).toBe('0.0625');
    expect(numberInputDraftAfterChange('0.5', '0', 0.1, 3600, 0.5)).toBe('0.1');
    expect(numberInputDraftAfterChange('0.3', '0.2', 0.25, 5, 0.1)).toBe('0.25');
  });

  it('keeps typed drafts that are not a single 0-based step', () => {
    expect(numberInputDraftAfterChange('3', '0', 0.0625, 16, 0.25)).toBe('0');
    expect(numberInputDraftAfterChange('3', '-5', 0.0625, 16, 0.25)).toBe('-5');
    expect(numberInputDraftAfterChange('3', '0.', 0.0625, 16, 0.25)).toBe('0.');
  });
});

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

  it('reverts a navigation hotkey to unbound because it has no built-in binding', () => {
    const state = snapshot();
    const assigned = applyOptimisticHotkeyChange(
      state.globalHotkeys,
      {
        kind: 'hotkey-value',
        action: 'skipForward',
        value: { code: 'KeyK', ctrl: false, alt: false, shift: false, meta: false },
      },
      { kind: 'global' },
      state,
    );
    expect(assigned.skipForward).toEqual({
      value: { code: 'KeyK', ctrl: false, alt: false, shift: false, meta: false },
      source: 'global',
    });
    expect(
      applyOptimisticHotkeyChange(
        assigned,
        { kind: 'hotkey-inherit', action: 'skipForward' },
        { kind: 'global' },
        state,
      ).skipForward,
    ).toEqual({ value: null, source: 'built-in' });
  });

  it('inherits a navigation field from global and from built-in', () => {
    const state = snapshot();
    expect(
      applyOptimisticChange(
        state.site!.behavior,
        { kind: 'value', field: 'skipForwardSeconds', value: 30 },
        { kind: 'site', hostname: 'www.youtube.com' },
        state,
      ).skipForwardSeconds,
    ).toEqual({ value: 30, source: 'site' });
    expect(
      applyOptimisticChange(
        { ...state.global, fastForwardSpeed: { value: 8, source: 'global' } },
        { kind: 'inherit', field: 'fastForwardSpeed' },
        { kind: 'global' },
        state,
      ).fastForwardSpeed,
    ).toEqual({ value: 3, source: 'built-in' });
  });
});
