// SPDX-License-Identifier: GPL-3.0-only

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import type { PopupStateResponse } from '../core/messages';
import { App } from '../entrypoints/popup/App';

function popupState(overrides: Partial<PopupStateResponse> = {}): PopupStateResponse {
  return {
    supported: true,
    hostname: 'www.youtube.com',
    siteSpeed: null,
    tabTarget: null,
    siteAccess: false,
    speedMin: 0.25,
    speedMax: 4,
    speedTick: 0.25,
    ...overrides,
  };
}

describe('Popup settings button', () => {
  let root: Root | null = null;
  let container: HTMLElement;
  const sendMessage = vi.fn();
  const createTab = vi.fn();

  async function renderApp(): Promise<void> {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <ThemeProvider initialTheme="dark">
          <App />
        </ThemeProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    sendMessage.mockReset();
    createTab.mockReset();
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'extid',
        sendMessage,
        getURL: (path: string) => `chrome-extension://extid/${path}`,
      },
      tabs: {
        getCurrent: vi.fn(async () => undefined),
        query: vi.fn(async () => [{ id: 1, url: 'https://www.youtube.com/watch' }]),
        create: createTab,
      },
      storage: {
        session: {
          get: vi.fn(async () => ({})),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        sync: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {}),
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('opens the current site settings when the site is disabled', async () => {
    sendMessage.mockResolvedValue(popupState({ siteAccess: false }));
    await renderApp();
    const button = container.querySelector('[aria-label="Open settings"]');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      if (button instanceof HTMLButtonElement) {
        button.click();
      }
    });
    expect(createTab).toHaveBeenCalledWith({
      url: 'chrome-extension://extid/options.html?site=www.youtube.com',
    });
  });

  it('opens Global settings when the page has no hostname', async () => {
    sendMessage.mockResolvedValue(popupState({ supported: false, hostname: null }));
    await renderApp();
    const button = container.querySelector('[aria-label="Open settings"]');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      if (button instanceof HTMLButtonElement) {
        button.click();
      }
    });
    expect(createTab).toHaveBeenCalledWith({
      url: 'chrome-extension://extid/options.html',
    });
  });
});
