// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  ariaKeyshortcutsFromBinding,
  displayKeyFromCode,
  visualHotkeyParts,
} from '../core/hotkey-format';
import { BUILT_IN_HOTKEYS } from '../settings/hotkey-binding';

describe('hotkey formatter', () => {
  it('falls back from KeyboardEvent.code to a visible key', () => {
    expect(displayKeyFromCode('BracketLeft')).toBe('[');
    expect(displayKeyFromCode('BracketRight')).toBe(']');
    expect(displayKeyFromCode('Backslash')).toBe('\\');
    expect(displayKeyFromCode('KeyA')).toBe('A');
    expect(displayKeyFromCode('Digit2')).toBe('2');
    expect(displayKeyFromCode('KeyA', new Map([['KeyA', 'q']]))).toBe('Q');
  });

  it('keeps visual labels and aria-keyshortcuts separate', () => {
    expect(visualHotkeyParts(BUILT_IN_HOTKEYS.decreaseSpeed, { mac: false })).toEqual(['[']);
    expect(
      visualHotkeyParts(
        { code: 'KeyK', ctrl: true, alt: false, shift: true, meta: false },
        { mac: true },
      ),
    ).toEqual(['⌃', '⇧', 'K']);
    expect(
      visualHotkeyParts(
        { code: 'KeyK', ctrl: true, alt: false, shift: true, meta: false },
        { mac: false },
      ),
    ).toEqual(['Ctrl', 'Shift', 'K']);
    expect(
      ariaKeyshortcutsFromBinding({
        code: 'KeyK',
        ctrl: true,
        alt: false,
        shift: true,
        meta: false,
      }),
    ).toBe('Control+Shift+K');
    expect(ariaKeyshortcutsFromBinding(BUILT_IN_HOTKEYS.increaseSpeed)).toBe(']');
  });
});
