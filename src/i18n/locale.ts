// SPDX-License-Identifier: GPL-3.0-only

import { listIncludes } from '../types/narrow';

export const SUPPORTED_LOCALES = ['en'] as const;
export const DEFAULT_LOCALE = 'en';

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleDirection = 'ltr' | 'rtl';

const RTL_LOCALES = new Set<string>();

function supportedLocale(value: string): SupportedLocale | null {
  return listIncludes(SUPPORTED_LOCALES, value) ? value : null;
}

export function resolveLocale(uiLanguage = readUILanguage()): SupportedLocale {
  const normalized = uiLanguage.trim().toLowerCase();
  const prefix = normalized.split('-')[0] ?? '';
  return supportedLocale(normalized) ?? supportedLocale(prefix) ?? DEFAULT_LOCALE;
}

export function localeDirection(locale: string): LocaleDirection {
  const prefix = locale.trim().toLowerCase().split('-')[0] ?? '';
  return RTL_LOCALES.has(prefix) ? 'rtl' : 'ltr';
}

export function applyDocumentLocale(
  locale: SupportedLocale = resolveLocale(),
  root: HTMLElement = document.documentElement,
): void {
  root.lang = locale;
  root.dir = localeDirection(locale);
}

function readUILanguage(): string {
  try {
    return chrome.i18n.getUILanguage();
  } catch {
    return DEFAULT_LOCALE;
  }
}
