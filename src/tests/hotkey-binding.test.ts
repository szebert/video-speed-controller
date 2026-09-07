// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_HOTKEYS,
  findHotkeyConflict,
  hotkeyBindingFromEvent,
  hotkeyBindingsEqual,
  isAssignableHotkeyCode,
  isHotkeyBinding,
  isTypingContext,
  matchHotkeyAction,
} from '../settings/hotkey-binding';

function keydown(
  code: string,
  extras: Partial<KeyboardEvent> & { altGraph?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    code,
    key: extras.key ?? code,
    ctrlKey: extras.ctrlKey,
    altKey: extras.altKey,
    shiftKey: extras.shiftKey,
    metaKey: extras.metaKey,
    bubbles: true,
    cancelable: true,
  });
  if (extras.altGraph) {
    Object.defineProperty(event, 'getModifierState', {
      value: (name: string) => name === 'AltGraph',
    });
  }
  return event;
}

describe('hotkey bindings', () => {
  it('accepts only complete assignable bindings', () => {
    expect(isAssignableHotkeyCode('KeyD')).toBe(true);
    expect(isAssignableHotkeyCode('Escape')).toBe(false);
    expect(isAssignableHotkeyCode('Tab')).toBe(false);
    expect(isAssignableHotkeyCode('ControlLeft')).toBe(false);
    expect(isAssignableHotkeyCode('')).toBe(false);
    expect(
      isHotkeyBinding({ code: 'KeyD', ctrl: false, alt: false, shift: false, meta: false }),
    ).toBe(true);
    expect(isHotkeyBinding({ code: 'KeyD' })).toBe(false);
    expect(
      isHotkeyBinding({ code: 'Escape', ctrl: false, alt: false, shift: false, meta: false }),
    ).toBe(false);
  });

  it('matches and conflicts on the prospective effective map', () => {
    const map = {
      decreaseSpeed: { ...BUILT_IN_HOTKEYS.decreaseSpeed },
      increaseSpeed: { ...BUILT_IN_HOTKEYS.increaseSpeed },
      resetSpeed: { ...BUILT_IN_HOTKEYS.resetSpeed },
    };
    expect(matchHotkeyAction(map, keydown('BracketLeft'))).toBe('decreaseSpeed');
    expect(matchHotkeyAction(map, keydown('BracketRight'))).toBe('increaseSpeed');
    expect(matchHotkeyAction(map, keydown('Backslash'))).toBe('resetSpeed');
    expect(matchHotkeyAction(map, keydown('KeyD'))).toBeNull();
    expect(matchHotkeyAction(map, keydown('BracketLeft', { altGraph: true }))).toBeNull();
    expect(findHotkeyConflict(map, 'decreaseSpeed', BUILT_IN_HOTKEYS.increaseSpeed)).toBe(
      'increaseSpeed',
    );
    expect(findHotkeyConflict(map, 'decreaseSpeed', BUILT_IN_HOTKEYS.decreaseSpeed)).toBeNull();
    expect(
      hotkeyBindingsEqual(BUILT_IN_HOTKEYS.increaseSpeed, {
        ...BUILT_IN_HOTKEYS.increaseSpeed,
      }),
    ).toBe(true);
  });

  it('builds a binding from a key event and skips typing contexts', () => {
    expect(hotkeyBindingFromEvent(keydown('KeyD'))).toEqual({
      code: 'KeyD',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    });
    expect(hotkeyBindingFromEvent(keydown('Escape'))).toBeNull();
    expect(hotkeyBindingFromEvent(keydown('KeyA', { altGraph: true }))).toBeNull();
    const input = document.createElement('input');
    document.body.append(input);
    let typing = false;
    input.addEventListener('keydown', (event) => {
      typing = isTypingContext(event);
    });
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));
    expect(typing).toBe(true);
    input.remove();
  });
});
