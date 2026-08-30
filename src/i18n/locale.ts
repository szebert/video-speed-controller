// SPDX-License-Identifier: GPL-3.0-only

export const SUPPORTED_LOCALES = ['en'] as const;
export const DEFAULT_LOCALE = 'en';

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleDirection = 'ltr' | 'rtl';

const RTL_LOCALES = new Set<string>();

export function resolveLocale(uiLanguage = readUILanguage()): SupportedLocale {
  const normalized = uiLanguage.trim().toLowerCase();
  if ((SUPPORTED_LOCALES as readonly string[]).includes(normalized)) {
    return normalized as SupportedLocale;
  }
  const prefix = normalized.split('-')[0] ?? '';
  if ((SUPPORTED_LOCALES as readonly string[]).includes(prefix)) {
    return prefix as SupportedLocale;
  }
  return DEFAULT_LOCALE;
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
