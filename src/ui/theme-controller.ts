// SPDX-License-Identifier: GPL-3.0-only

import { sendOptionsRequest } from '@/protocol/rpc';
import { THEME_KEY } from '@/settings/site-behavior';
import { applyTheme, parseThemeRecord, type ThemePreference } from '@/settings/theme';

export type ThemeState = {
  theme: ThemePreference;
};

type Listener = () => void;

export class ThemeController {
  private theme: ThemePreference;
  private readonly listeners = new Set<Listener>();
  private media: MediaQueryList | null = null;
  private started = false;

  constructor(initialTheme: ThemePreference) {
    this.theme = initialTheme;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    applyTheme(this.theme);
    chrome.storage.onChanged.addListener(this.onStorage);
    this.bindMedia();
  }

  getState(): ThemeState {
    return { theme: this.theme };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setTheme(preference: ThemePreference): void {
    this.theme = preference;
    applyTheme(preference);
    this.bindMedia();
    this.emit();
    void sendOptionsRequest({ type: 'SET_THEME', preference }).catch(() => {
      // Apply immediately even if the persist RPC rejects.
    });
  }

  destroy(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    chrome.storage.onChanged.removeListener(this.onStorage);
    this.media?.removeEventListener('change', this.onScheme);
    this.media = null;
    this.listeners.clear();
  }

  private readonly onStorage = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ): void => {
    if (areaName !== 'sync' || !changes[THEME_KEY]) {
      return;
    }
    const parsed = parseThemeRecord(changes[THEME_KEY].newValue);
    if (!parsed) {
      return;
    }
    this.theme = parsed.preference;
    applyTheme(parsed.preference);
    this.bindMedia();
    this.emit();
  };

  private readonly onScheme = (): void => {
    if (this.theme === 'system') {
      applyTheme('system');
    }
  };

  private bindMedia(): void {
    this.media?.removeEventListener('change', this.onScheme);
    this.media = null;
    if (this.theme !== 'system' || typeof window.matchMedia !== 'function') {
      return;
    }
    this.media = window.matchMedia('(prefers-color-scheme: dark)');
    this.media.addEventListener('change', this.onScheme);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
