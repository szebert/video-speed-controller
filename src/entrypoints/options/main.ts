// SPDX-License-Identifier: GPL-3.0-only

import { applyDocumentLocale, resolveLocale } from '@/i18n/locale';
import { t } from '@/i18n/t';
import { applyTheme, DEFAULT_THEME, getStoredTheme } from '@/settings/theme';
import { ThemeController } from '@/ui/theme-controller';
import '@/styles/globals.css';
import { OptionsController } from './options-controller';
import { OptionsView } from './options-view';
import './options.css';

const locale = resolveLocale();
applyDocumentLocale(locale);
document.title = t('settingsTitle');

const root = document.getElementById('root');
if (!root) {
  throw new Error('Options root is missing');
}

const initialTheme = await getStoredTheme().catch(() => DEFAULT_THEME);
applyTheme(initialTheme);

const theme = new ThemeController(initialTheme);
const options = new OptionsController();
const view = new OptionsView(root, options, theme);
theme.start();
options.start();
view.start();
