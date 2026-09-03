// SPDX-License-Identifier: GPL-3.0-only

import { I18nProvider } from 'react-aria-components';
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { applyDocumentLocale, resolveLocale } from '@/i18n/locale';
import { applyTheme, DARK_DEFAULT, getStoredTheme } from '@/settings/theme';
import { t } from '@/i18n/t';
import { App } from './App';
import '@/styles/globals.css';

const locale = resolveLocale();
applyDocumentLocale(locale);
document.title = t('settingsTitle');

const root = document.getElementById('root');
if (!root) {
  throw new Error('Options root is missing');
}

const initialTheme = await getStoredTheme().catch(() => DARK_DEFAULT);
applyTheme(initialTheme);

createRoot(root).render(
  <StrictMode>
    <I18nProvider locale={locale}>
      <ThemeProvider initialTheme={initialTheme}>
        <App />
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
