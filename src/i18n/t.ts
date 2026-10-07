// SPDX-License-Identifier: GPL-3.0-only

import { i18n, type GeneratedI18nStructure } from '#i18n';
import en from '../locales/en.json';
import type { Equal } from '../types/equal';
import { listIncludes } from '../types/narrow';

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

type StructureKey = keyof GeneratedI18nStructure;
type KeysWithSubstitutions<Count extends number> = {
  [Key in StructureKey]: GeneratedI18nStructure[Key] extends { substitutions: Count; plural: false }
    ? Key
    : never;
}[StructureKey];

const ONE_SUBSTITUTION_KEYS = [
  'hotkeyJumpToPercent',
  'hotkeyJumpToPercentDescription',
  'navJumpToPercent',
] as const satisfies readonly KeysWithSubstitutions<1>[];
const TWO_SUBSTITUTION_KEYS = [
  'seekPosition',
] as const satisfies readonly KeysWithSubstitutions<2>[];

true satisfies Equal<(typeof ONE_SUBSTITUTION_KEYS)[number], KeysWithSubstitutions<1>>;
true satisfies Equal<(typeof TWO_SUBSTITUTION_KEYS)[number], KeysWithSubstitutions<2>>;

function translate(key: MessageKey, substitutions?: readonly string[]): string {
  if (listIncludes(ONE_SUBSTITUTION_KEYS, key)) {
    const first = substitutions?.[0];
    return first === undefined ? '' : i18n.t(key, [first]);
  }
  if (listIncludes(TWO_SUBSTITUTION_KEYS, key)) {
    const first = substitutions?.[0];
    const second = substitutions?.[1];
    return first === undefined || second === undefined ? '' : i18n.t(key, [first, second]);
  }
  return i18n.t(key);
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
