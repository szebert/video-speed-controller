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

  it('substitutes positional values on the English fallback', () => {
    expect(t('seekPosition', ['12:43', '48:21'])).toBe('12:43 of 48:21');
    expect(t('hotkeyJumpToPercent', ['50'])).toBe('Jump to 50%');
    expect(t('hotkeyJumpToPercentDescription', ['50'])).toBe(
      'Seek the video to 50% in its seekable range.',
    );
    expect(t('navJumpToPercent', ['10'])).toBe('Jump to 10%');
    expect(t('seekVideo')).toBe('Seek video');
  });
});
