// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  displayedCurrentSpeed,
  resetToSpeedLabel,
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
import { resolveSiteBehavior } from '../settings/site-behavior';
import type { BehaviorSettingsSnapshot } from '../protocol/schemas/shared';

function snapshot(): BehaviorSettingsSnapshot {
  const { hotkeys, ...global } = resolveSiteBehavior();
  return {
    global,
    globalHotkeys: hotkeys,
    site: {
      hostname: 'www.youtube.com',
      behavior: { ...global, speed: { value: 1.25, source: 'site' as const } },
      hotkeys,
      speedOverrideKind: 'value',
      seedTarget: 1.25,
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

  it('clamps current speed when an optimistic max collapses the policy', () => {
    const state = snapshot();
    const withSpeed = applyOptimisticChange(
      state.global,
      { kind: 'value', field: 'speed', value: 2 },
      { kind: 'global' },
      state,
    );
    expect(withSpeed.speed).toEqual({ value: 2, source: 'global' });
    expect(
      applyOptimisticChange(
        withSpeed,
        { kind: 'value', field: 'speedMax', value: 1 },
        { kind: 'global' },
        state,
      ).speed,
    ).toEqual({ value: 1, source: 'global' });
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

describe('resetToSpeedLabel', () => {
  it('names the Reset destination', () => {
    expect(resetToSpeedLabel(1)).toBe('Reset to 1.00×');
    expect(resetToSpeedLabel(1.25)).toBe('Reset to 1.25×');
  });
});

describe('displayedCurrentSpeed', () => {
  it('shows the stored site current when the override is a value', () => {
    const state = snapshot();
    expect(
      displayedCurrentSpeed(
        { kind: 'site', hostname: 'www.youtube.com' },
        state.site!.behavior,
        state,
        undefined,
      ),
    ).toEqual({ value: 1.25, muted: false });
  });

  it('shows defaultSpeed for a persisted inherit and seedTarget when missing', () => {
    const state = snapshot();
    state.site = {
      ...state.site!,
      behavior: {
        ...state.site!.behavior,
        speed: { value: 2, source: 'global' },
        defaultSpeed: { value: 1.25, source: 'site' },
      },
      speedOverrideKind: 'inherit',
      seedTarget: 2,
    };
    expect(
      displayedCurrentSpeed(
        { kind: 'site', hostname: 'www.youtube.com' },
        state.site.behavior,
        state,
        undefined,
      ),
    ).toEqual({ value: 1.25, muted: true });
    state.site.speedOverrideKind = 'missing';
    state.site.seedTarget = 2;
    expect(
      displayedCurrentSpeed(
        { kind: 'site', hostname: 'www.youtube.com' },
        state.site.behavior,
        state,
        undefined,
      ),
    ).toEqual({ value: 2, muted: true });
  });

  it('uses optimistic inherit defaultSpeed instead of a stale value kind', () => {
    const state = snapshot();
    const behavior = applyOptimisticChange(
      state.site!.behavior,
      { kind: 'inherit', field: 'speed' },
      { kind: 'site', hostname: 'www.youtube.com' },
      state,
    );
    expect(
      displayedCurrentSpeed({ kind: 'site', hostname: 'www.youtube.com' }, behavior, state, {
        kind: 'inherit',
        field: 'speed',
      }),
    ).toEqual({ value: behavior.defaultSpeed.value, muted: true });
  });
});
