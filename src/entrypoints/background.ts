// SPDX-License-Identifier: GPL-3.0-only

import { schedulePermissionsReconcile } from '../background/permissions-lifecycle';
import { enableSite } from '../background/enable-site';
import { handleFrameReady } from '../background/frame-ready';
import { getPopupState } from '../background/popup-state';
import { resetSiteSpeed } from '../background/reset-site-speed';
import { adjustTabSpeed } from '../background/adjust-tab-speed';
import { openOptionsFromSender } from '../background/open-options-from-sender';
import { setOverlayPositionFromSender } from '../background/set-overlay-position';
import { setSpeed } from '../background/set-speed';
import {
  deleteSiteBehaviorSettings,
  getBehaviorSettings,
  getCustomSites,
  resetAllBehaviorSettings,
  resetGlobalBehaviorSettings,
  setBehaviorSetting,
} from '../background/behavior-settings';
import { enqueueTabMutation } from '../background/tab-mutation-queue';
import { authorizeBackgroundInbound } from '../background/authorize-inbound';
import { inboundChannel, parseBackgroundInbound } from '../protocol/schemas/background-inbound';
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
    const inbound = parseBackgroundInbound(message);
    if (!inbound) {
      return false;
    }
    const authorization = authorizeBackgroundInbound(
      inboundChannel(inbound.type),
      inbound.type,
      sender,
    );
    if (authorization === 'ignore') {
      return false;
    }
    if (authorization === 'unauthorized') {
      sendResponse({ ok: false, error: 'Unauthorized' });
      return false;
    }
    const request = inbound;

    if (request.type === 'GET_POPUP_STATE') {
      void getPopupState(request.tabId, request.url).then(
        sendResponse,
        respondWithError(sendResponse, 'GET_POPUP_STATE', undefined),
      );
      return true;
    }
    if (request.type === 'ENABLE_SITE') {
      void enqueueTabMutation(request.tabId, () => enableSite(request.tabId, request.url)).then(
        sendResponse,
        respondWithError(sendResponse, 'ENABLE_SITE', {
          ok: false,
          error: 'Unexpected enable failure',
        }),
      );
      return true;
    }
    if (request.type === 'SET_SPEED') {
      void enqueueTabMutation(request.tabId, () =>
        setSpeed(request.tabId, request.url, request.speed),
      ).then(
        sendResponse,
        respondWithError(sendResponse, 'SET_SPEED', {
          ok: false,
          error: 'Unexpected set-speed failure',
        }),
      );
      return true;
    }
    if (request.type === 'ADJUST_SPEED') {
      const tabId = sender.tab?.id;
      if (tabId == null) {
        sendResponse({ ok: false, error: 'Missing tab' });
        return false;
      }
      void enqueueTabMutation(tabId, () => adjustTabSpeed(sender, request.direction)).then(
        sendResponse,
        respondWithError(sendResponse, 'ADJUST_SPEED', {
          ok: false,
          error: 'Unexpected adjust-speed failure',
        }),
      );
      return true;
    }
    if (request.type === 'SET_OVERLAY_POSITION') {
      void setOverlayPositionFromSender(sender, request.position).then(
        sendResponse,
        respondWithError(sendResponse, 'SET_OVERLAY_POSITION', {
          ok: false,
          error: 'Unexpected overlay position failure',
        }),
      );
      return true;
    }
    if (request.type === 'OPEN_OPTIONS_PAGE') {
      void openOptionsFromSender(sender).then(
        sendResponse,
        respondWithError(sendResponse, 'OPEN_OPTIONS_PAGE', {
          ok: false,
          error: 'Unexpected options open failure',
        }),
      );
      return true;
    }
    if (request.type === 'RESET_SITE_SPEED') {
      void enqueueTabMutation(request.tabId, () => resetSiteSpeed(request.tabId, request.url)).then(
        sendResponse,
        respondWithError(sendResponse, 'RESET_SITE_SPEED', {
          ok: false,
          error: 'Unexpected reset failure',
        }),
      );
      return true;
    }
    if (request.type === 'FRAME_READY') {
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
    if (request.type === 'GET_BEHAVIOR_SETTINGS') {
      void getBehaviorSettings(request, sender).then(
        sendResponse,
        respondWithError(sendResponse, 'GET_BEHAVIOR_SETTINGS', {
          ok: false,
          error: 'Unexpected settings read failure',
        }),
      );
      return true;
    }
    if (request.type === 'GET_CUSTOM_SITES') {
      void getCustomSites(sender).then(
        sendResponse,
        respondWithError(sendResponse, 'GET_CUSTOM_SITES', {
          ok: false,
          error: 'Unexpected custom sites read failure',
        }),
      );
      return true;
    }
    if (request.type === 'SET_BEHAVIOR_SETTING') {
      void setBehaviorSetting(request, sender).then(
        sendResponse,
        respondWithError(sendResponse, 'SET_BEHAVIOR_SETTING', {
          ok: false,
          error: 'Unexpected settings write failure',
        }),
      );
      return true;
    }
    if (request.type === 'DELETE_SITE_SETTINGS') {
      void deleteSiteBehaviorSettings(request, sender).then(
        sendResponse,
        respondWithError(sendResponse, 'DELETE_SITE_SETTINGS', {
          ok: false,
          error: 'Unexpected site delete failure',
        }),
      );
      return true;
    }
    if (request.type === 'RESET_GLOBAL_BEHAVIOR') {
      void resetGlobalBehaviorSettings(request, sender).then(
        sendResponse,
        respondWithError(sendResponse, 'RESET_GLOBAL_BEHAVIOR', {
          ok: false,
          error: 'Unexpected reset failure',
        }),
      );
      return true;
    }
    if (request.type === 'RESET_ALL_BEHAVIOR') {
      void resetAllBehaviorSettings(request, sender).then(
        sendResponse,
        respondWithError(sendResponse, 'RESET_ALL_BEHAVIOR', {
          ok: false,
          error: 'Unexpected reset failure',
        }),
      );
      return true;
    }
    if (request.type === 'TOP_FRAME_DESTROYED') {
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
