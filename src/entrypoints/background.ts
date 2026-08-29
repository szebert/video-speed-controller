// SPDX-License-Identifier: GPL-3.0-only

import { onPermissionsChanged } from '../background/permissions-lifecycle';
import { enableSite } from '../background/enable-site';
import { handleFrameReady } from '../background/frame-ready';
import { getPopupState } from '../background/popup-state';
import { setSpeed } from '../background/set-speed';
import { isExtensionRequest } from '../core/messages';
import { clearTabState } from '../storage/tab-state';

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void onPermissionsChanged();
  });
  chrome.runtime.onStartup.addListener(() => {
    void onPermissionsChanged();
  });

  chrome.permissions.onAdded.addListener(() => {
    void onPermissionsChanged();
  });
  chrome.permissions.onRemoved.addListener(() => {
    void onPermissionsChanged();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      void clearTabState(tabId);
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void clearTabState(tabId);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isExtensionRequest(message)) {
      return false;
    }

    if (message.type === 'GET_POPUP_STATE') {
      void getPopupState(message.tabId, message.url).then(sendResponse);
      return true;
    }
    if (message.type === 'ENABLE_SITE') {
      void enableSite(message.tabId, message.url).then(sendResponse);
      return true;
    }
    if (message.type === 'SET_SPEED') {
      void setSpeed(message.tabId, message.url, message.speed).then(sendResponse);
      return true;
    }
    if (message.type === 'FRAME_READY') {
      void handleFrameReady(sender).then(sendResponse);
      return true;
    }
    if (message.type === 'TOP_FRAME_DESTROYED') {
      const tabId = sender.tab?.id;
      if (tabId != null && sender.frameId === 0) {
        void clearTabState(tabId);
      }
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
});
