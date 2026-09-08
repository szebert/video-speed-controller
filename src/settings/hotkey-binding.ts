// SPDX-License-Identifier: GPL-3.0-only

import type { SiteHotkeyAction } from './site-behavior';

export type HotkeyBinding = {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

export type EffectiveHotkeyMap = Record<SiteHotkeyAction, HotkeyBinding | null>;

export const HOTKEY_BINDING_KEYS = ['code', 'ctrl', 'alt', 'shift', 'meta'] as const;

const REJECTED_HOTKEY_CODES = new Set([
  '',
  'Unidentified',
  'Escape',
  'Tab',
  'Backspace',
  'Delete',
  'Dead',
  'Process',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'AltGraph',
  'CapsLock',
  'Fn',
  'FnLock',
  'Hyper',
  'OSLeft',
  'OSRight',
]);

export const BUILT_IN_HOTKEYS = {
  decreaseSpeed: {
    code: 'BracketLeft',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  },
  increaseSpeed: {
    code: 'BracketRight',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  },
  resetSpeed: {
    code: 'Backslash',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  },
} as const satisfies EffectiveHotkeyMap;

export function isAssignableHotkeyCode(code: unknown): code is string {
  return typeof code === 'string' && code.length > 0 && !REJECTED_HOTKEY_CODES.has(code);
}

export function isHotkeyBinding(value: unknown): value is HotkeyBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    keys.length === HOTKEY_BINDING_KEYS.length &&
    HOTKEY_BINDING_KEYS.every((key) => key in record) &&
    isAssignableHotkeyCode(record.code) &&
    typeof record.ctrl === 'boolean' &&
    typeof record.alt === 'boolean' &&
    typeof record.shift === 'boolean' &&
    typeof record.meta === 'boolean'
  );
}

export function hotkeyBindingsEqual(
  left: HotkeyBinding | null,
  right: HotkeyBinding | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.code === right.code &&
    left.ctrl === right.ctrl &&
    left.alt === right.alt &&
    left.shift === right.shift &&
    left.meta === right.meta
  );
}

export function emptyEffectiveHotkeys(): EffectiveHotkeyMap {
  return {
    decreaseSpeed: null,
    increaseSpeed: null,
    resetSpeed: null,
  };
}

export function builtInEffectiveHotkeys(): EffectiveHotkeyMap {
  return {
    decreaseSpeed: { ...BUILT_IN_HOTKEYS.decreaseSpeed },
    increaseSpeed: { ...BUILT_IN_HOTKEYS.increaseSpeed },
    resetSpeed: { ...BUILT_IN_HOTKEYS.resetSpeed },
  };
}

export function findHotkeyConflict(
  map: EffectiveHotkeyMap,
  action: SiteHotkeyAction,
  binding: HotkeyBinding,
): SiteHotkeyAction | null {
  for (const other of Object.keys(map) as SiteHotkeyAction[]) {
    if (other === action) {
      continue;
    }
    const current = map[other];
    if (current && hotkeyBindingsEqual(current, binding)) {
      return other;
    }
  }
  return null;
}

export function findHotkeyMapConflict(map: EffectiveHotkeyMap): SiteHotkeyAction | null {
  const seen: { action: SiteHotkeyAction; binding: HotkeyBinding }[] = [];
  for (const action of Object.keys(map) as SiteHotkeyAction[]) {
    const binding = map[action];
    if (!binding) {
      continue;
    }
    for (const prior of seen) {
      if (hotkeyBindingsEqual(prior.binding, binding)) {
        return action;
      }
    }
    seen.push({ action, binding });
  }
  return null;
}

export function matchHotkeyAction(
  map: EffectiveHotkeyMap,
  event: KeyboardEvent,
): SiteHotkeyAction | null {
  if (event.getModifierState?.('AltGraph')) {
    return null;
  }
  let match: SiteHotkeyAction | null = null;
  for (const action of Object.keys(map) as SiteHotkeyAction[]) {
    const binding = map[action];
    if (!binding || !hotkeyBindingMatches(binding, event)) {
      continue;
    }
    if (match) {
      return null;
    }
    match = action;
  }
  return match;
}

export function hotkeyBindingMatches(binding: HotkeyBinding, event: KeyboardEvent): boolean {
  return (
    event.code === binding.code &&
    event.ctrlKey === binding.ctrl &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift &&
    event.metaKey === binding.meta
  );
}

export function hotkeyBindingFromEvent(event: KeyboardEvent): HotkeyBinding | null {
  if (event.isComposing || event.key === 'Dead' || event.key === 'Process') {
    return null;
  }
  if (event.getModifierState?.('AltGraph')) {
    return null;
  }
  if (!isAssignableHotkeyCode(event.code)) {
    return null;
  }
  return {
    code: event.code,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}

export function isTypingContext(event: Event): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  for (const node of path) {
    if (!(node instanceof Element)) {
      continue;
    }
    const tag = node.localName;
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return true;
    }
    if (node instanceof HTMLElement && node.isContentEditable) {
      return true;
    }
    if (node.getAttribute('role') === 'textbox') {
      return true;
    }
  }
  return false;
}
