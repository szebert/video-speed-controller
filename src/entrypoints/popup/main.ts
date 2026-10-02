// SPDX-License-Identifier: GPL-3.0-only

import { applyDocumentLocale, resolveLocale } from '@/i18n/locale';
import { applyTheme, DEFAULT_THEME, getStoredTheme } from '@/settings/theme';
import { ThemeController } from '@/ui/theme-controller';
import '@/styles/globals.css';
import { PopupController } from './popup-controller';
import { PopupView } from './popup-view';

const locale = resolveLocale();
applyDocumentLocale(locale);

const root = document.getElementById('root');
if (!root) {
  throw new Error('Popup root is missing');
}

const initialTheme = await getStoredTheme().catch(() => DEFAULT_THEME);
applyTheme(initialTheme);

const theme = new ThemeController(initialTheme);
const popup = new PopupController();
const view = new PopupView(root, popup, theme);
theme.start();
popup.start();
view.start();
