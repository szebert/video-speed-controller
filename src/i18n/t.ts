// SPDX-License-Identifier: GPL-3.0-only

import { i18n } from '#i18n';
import en from '../locales/en.json';

export type MessageKey = keyof typeof en;

export const ENGLISH_MESSAGES: Record<MessageKey, string> = en;

/**
 * Chrome only loads `_locales` when the extension is enabled. During `wxt`
 * serve, HMR, or after adding locales to an already-loaded unpacked build,
 * `getMessage` returns "" for every key until the extension is toggled.
 * Fall back to the English source catalog so the popup never renders blank labels.
 */
export function t(key: MessageKey, translate: (key: MessageKey) => string = lookup): string {
  return translate(key) || ENGLISH_MESSAGES[key];
}

function lookup(key: MessageKey): string {
  try {
    return i18n.t(key);
  } catch {
    return '';
  }
}
