// SPDX-License-Identifier: GPL-3.0-only

import { getSiteKey } from '../storage/site-key';

export const E2E_POPUP_TARGET_URL_KEY = 'e2ePopupTargetUrl';
export const E2E_POPUP_TARGET_TAB_ID_KEY = 'e2ePopupTargetTabId';

export type PopupTab = {
  id?: number;
  url?: string;
  lastAccessed?: number;
};

export function isOwnExtensionPage(url: string | undefined, extensionId: string): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'chrome-extension:' && parsed.hostname === extensionId;
  } catch {
    return false;
  }
}

export function isSupportedHttpTab(
  tab: PopupTab | undefined,
): tab is PopupTab & { id: number; url: string } {
  return tab?.id != null && !!tab.url && getSiteKey(tab.url).supported;
}

/**
 * Toolbar popups see the site as the current-window active tab.
 * Opening popup.html as a tab (Playwright) makes that tab the active one, and without
 * the `tabs` permission Chrome hides its URL — do not treat a URL-less "active" tab as
 * the site. `currentTabId` is `chrome.tabs.getCurrent()` (set only when the popup is a
 * real tab). chrome:// stays unavailable; we do not steal another site.
 */
export function resolvePopupTargetTab(
  activeTab: PopupTab | undefined,
  allTabs: PopupTab[],
  extensionId: string,
  e2eTarget?: { tabId?: number; url?: string },
  currentTabId?: number,
): PopupTab | undefined {
  const openedAsTab = currentTabId != null && activeTab?.id === currentTabId;
  const activeIsPopupPage = isOwnExtensionPage(activeTab?.url, extensionId) || openedAsTab;

  if (activeTab && !activeIsPopupPage) {
    return activeTab;
  }
  if (e2eTarget?.tabId != null && typeof e2eTarget.url === 'string') {
    return { id: e2eTarget.tabId, url: e2eTarget.url };
  }
  return allTabs
    .filter(
      (tab) =>
        tab.id !== currentTabId &&
        !isOwnExtensionPage(tab.url, extensionId) &&
        isSupportedHttpTab(tab),
    )
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
}
