// SPDX-License-Identifier: GPL-3.0-only

import { schedulePermissionsReconcile } from '../background/permissions-lifecycle';
import { enableSite } from '../background/enable-site';
import { handleFrameReady } from '../background/frame-ready';
import { getPopupState } from '../background/popup-state';
import { resetSiteSpeed } from '../background/reset-site-speed';
import { setSpeed } from '../background/set-speed';
import { enqueueTabMutation } from '../background/tab-mutation-queue';
import { isExtensionRequest } from '../core/messages';
import { restrictStorageAccess } from '../storage/restrict-access';
import { clearTabState } from '../storage/tab-state';

function respondWithError(
  sendResponse: (response?: unknown) => void,
  label: string,
  fallback: unknown,
): (error: unknown) => void {
  return (error: unknown) => {
    console.warn(`${label} failed`, error);
    sendResponse(fallback);
  };
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    schedulePermissionsReconcile('onInstalled');
  });
  chrome.runtime.onStartup.addListener(() => {
    schedulePermissionsReconcile('onStartup');
  });

  chrome.permissions.onAdded.addListener(() => {
    schedulePermissionsReconcile('onAdded');
  });
  chrome.permissions.onRemoved.addListener(() => {
    schedulePermissionsReconcile('onRemoved');
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      void enqueueTabMutation(tabId, () => clearTabState(tabId)).catch((error) => {
        console.warn('Failed to clear tab state', error);
      });
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void enqueueTabMutation(tabId, () => clearTabState(tabId)).catch((error) => {
      console.warn('Failed to clear tab state', error);
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isExtensionRequest(message)) {
      return false;
    }

    if (message.type === 'GET_POPUP_STATE') {
      void getPopupState(message.tabId, message.url).then(
        sendResponse,
        respondWithError(sendResponse, 'GET_POPUP_STATE', undefined),
      );
      return true;
    }
    if (message.type === 'ENABLE_SITE') {
      void enqueueTabMutation(message.tabId, () => enableSite(message.tabId, message.url)).then(
        sendResponse,
        respondWithError(sendResponse, 'ENABLE_SITE', {
          ok: false,
          error: 'Unexpected enable failure',
        }),
      );
      return true;
    }
    if (message.type === 'SET_SPEED') {
      void enqueueTabMutation(message.tabId, () =>
        setSpeed(message.tabId, message.url, message.speed),
      ).then(
        sendResponse,
        respondWithError(sendResponse, 'SET_SPEED', {
          ok: false,
          error: 'Unexpected set-speed failure',
        }),
      );
      return true;
    }
    if (message.type === 'RESET_SITE_SPEED') {
      void enqueueTabMutation(message.tabId, () => resetSiteSpeed(message.tabId, message.url)).then(
        sendResponse,
        respondWithError(sendResponse, 'RESET_SITE_SPEED', {
          ok: false,
          error: 'Unexpected reset failure',
        }),
      );
      return true;
    }
    if (message.type === 'FRAME_READY') {
      const tabId = sender.tab?.id;
      if (tabId == null) {
        sendResponse({ action: 'dormant' });
        return false;
      }
      void enqueueTabMutation(tabId, () => handleFrameReady(sender)).then(
        sendResponse,
        respondWithError(sendResponse, 'FRAME_READY', { action: 'dormant' }),
      );
      return true;
    }
    if (message.type === 'TOP_FRAME_DESTROYED') {
      const tabId = sender.tab?.id;
      if (tabId != null && sender.frameId === 0) {
        void enqueueTabMutation(tabId, () => clearTabState(tabId)).catch((error) => {
          console.warn('Failed to clear tab state', error);
        });
      }
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  void restrictStorageAccess().catch(() => {
    // Storage hardening must not crash or disable the worker.
  });
});
