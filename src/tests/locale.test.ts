// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { localeDirection, resolveLocale } from '../i18n/locale';
import { t } from '../i18n/t';

describe('locale resolution', () => {
  it('maps a regional English UI language to en / ltr', () => {
    expect(resolveLocale('en-US')).toBe('en');
    expect(localeDirection(resolveLocale('en-US'))).toBe('ltr');
  });

  it('falls back to en / ltr for an unsupported UI language', () => {
    expect(resolveLocale('es-MX')).toBe('en');
    expect(localeDirection(resolveLocale('es-MX'))).toBe('ltr');
    expect(resolveLocale('')).toBe('en');
  });

  it('falls back to English source strings when chrome.i18n is empty', () => {
    expect(t('popupTitle', () => '')).toBe('OS Video Speed Controller');
    expect(t('enabledOnThisSite', () => '')).toBe('Enabled on this site');
    expect(t('reset', () => 'Reset')).toBe('Reset');
  });
});
