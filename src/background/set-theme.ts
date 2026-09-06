// SPDX-License-Identifier: GPL-3.0-only

import type { SetThemeRequest, SetThemeResponse } from '../protocol/schemas/options-background';
import { persistTheme, type ThemeDeps } from '../settings/theme';
import { isExtensionPageSender } from './extension-page-sender';

export type SetThemeDeps = ThemeDeps;

export async function setTheme(
  message: SetThemeRequest,
  sender: chrome.runtime.MessageSender,
  deps: SetThemeDeps = {},
): Promise<SetThemeResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }
  try {
    await persistTheme(message.preference, deps);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to persist theme',
    };
  }
}
