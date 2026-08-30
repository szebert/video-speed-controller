// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { localeDirection, resolveLocale } from '../i18n/locale';

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
});
