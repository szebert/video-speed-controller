// SPDX-License-Identifier: GPL-3.0-only

import type { HotkeyBinding } from '../settings/hotkey-binding';

const CODE_FALLBACKS: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Enter: 'Enter',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
};

export function isMacPlatform(platform = navigator.platform): boolean {
  return /Mac|iPhone|iPad/.test(platform);
}

export function displayKeyFromCode(code: string, layoutMap?: ReadonlyMap<string, string>): string {
  const mapped = layoutMap?.get(code);
  if (mapped) {
    return mapped.length === 1 ? mapped.toUpperCase() : mapped;
  }
  if (CODE_FALLBACKS[code]) {
    return CODE_FALLBACKS[code];
  }
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  return code;
}

export function visualHotkeyParts(
  binding: HotkeyBinding,
  options: { mac?: boolean; layoutMap?: ReadonlyMap<string, string> } = {},
): string[] {
  const mac = options.mac ?? isMacPlatform();
  const parts: string[] = [];
  if (binding.ctrl) {
    parts.push(mac ? '⌃' : 'Ctrl');
  }
  if (binding.alt) {
    parts.push(mac ? '⌥' : 'Alt');
  }
  if (binding.shift) {
    parts.push(mac ? '⇧' : 'Shift');
  }
  if (binding.meta) {
    parts.push(mac ? '⌘' : 'Win');
  }
  parts.push(displayKeyFromCode(binding.code, options.layoutMap));
  return parts;
}

export function ariaKeyshortcutsFromBinding(binding: HotkeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) {
    parts.push('Control');
  }
  if (binding.alt) {
    parts.push('Alt');
  }
  if (binding.shift) {
    parts.push('Shift');
  }
  if (binding.meta) {
    parts.push('Meta');
  }
  parts.push(displayKeyFromCode(binding.code));
  return parts.join('+');
}

export async function readKeyboardLayoutMap(): Promise<ReadonlyMap<string, string> | undefined> {
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardLayoutNavigator }).keyboard;
  if (!keyboard || typeof keyboard.getLayoutMap !== 'function') {
    return undefined;
  }
  try {
    return await keyboard.getLayoutMap();
  } catch {
    return undefined;
  }
}

type KeyboardLayoutNavigator = {
  getLayoutMap: () => Promise<Map<string, string>>;
};
