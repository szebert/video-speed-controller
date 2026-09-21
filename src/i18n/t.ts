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
export function t(key: MessageKey, translate?: (key: MessageKey) => string): string;
export function t(key: MessageKey, substitutions: readonly string[]): string;
export function t(
  key: MessageKey,
  substitutionsOrTranslate?: readonly string[] | ((key: MessageKey) => string),
): string {
  if (typeof substitutionsOrTranslate === 'function') {
    return substitutionsOrTranslate(key) || ENGLISH_MESSAGES[key];
  }
  const substitutions = substitutionsOrTranslate;
  const translated = lookup(key, substitutions);
  if (translated) {
    return translated;
  }
  return applySubstitutions(ENGLISH_MESSAGES[key], substitutions);
}

function lookup(key: MessageKey, substitutions?: readonly string[]): string {
  try {
    return translate(key, substitutions);
  } catch {
    return '';
  }
}

function translate(key: MessageKey, substitutions?: readonly string[]): string {
  const translateMessage = i18n.t as (name: string, values?: readonly string[]) => string;
  return substitutions ? translateMessage(key, substitutions) : translateMessage(key);
}

function applySubstitutions(template: string, substitutions?: readonly string[]): string {
  if (!substitutions) {
    return template;
  }
  return substitutions.reduce(
    (text, value, index) => text.replaceAll(`$${index + 1}`, value),
    template,
  );
}
