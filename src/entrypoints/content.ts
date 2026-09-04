// SPDX-License-Identifier: GPL-3.0-only

import {
  getOriginIdentity,
  hostPatternsCover,
  isOpaqueOrigin,
  type HostPattern,
} from '../access/site-access';
import { destroyEngine, startEngine } from '../core/video-speed-engine';
import { intentFailureMessage, isExtensionRequest } from '../core/messages';
import type { OverlayActions } from '../overlay/types';
import type { OverlayPosition } from '../settings/site-behavior';

async function sendOverlayIntent(
  message:
    | { type: 'ADJUST_SPEED'; direction: -1 | 1 }
    | { type: 'SET_OVERLAY_POSITION'; position: OverlayPosition }
    | { type: 'OPEN_OPTIONS_PAGE' },
  label: string,
): Promise<void> {
  try {
    const failure = intentFailureMessage(await chrome.runtime.sendMessage(message));
    if (failure) {
      console.warn(`${label} failed`, failure);
    }
  } catch (error) {
    console.warn(`${label} failed`, error);
  }
}

const overlayActions: OverlayActions = {
  adjustSpeed(direction) {
    void sendOverlayIntent(
      {
        type: 'ADJUST_SPEED',
        direction,
      },
      'ADJUST_SPEED',
    );
  },
  setOverlayPosition(position) {
    void sendOverlayIntent(
      {
        type: 'SET_OVERLAY_POSITION',
        position,
      },
      'SET_OVERLAY_POSITION',
    );
  },
  openSettings() {
    void sendOverlayIntent({ type: 'OPEN_OPTIONS_PAGE' }, 'OPEN_OPTIONS_PAGE');
  },
};

function isTopFrame(): boolean {
  try {
    return window === window.top;
  } catch {
    return false;
  }
}

function shouldDestroyForAllowed(allowedHostPatterns: HostPattern[]): boolean {
  if (isOpaqueOrigin(location.origin)) {
    return true;
  }
  const identity = getOriginIdentity(location.href);
  if (!identity) {
    return true;
  }
  return !hostPatternsCover(identity, allowedHostPatterns);
}

function reconcileAccess(allowedHostPatterns: HostPattern[]): void {
  if (!shouldDestroyForAllowed(allowedHostPatterns)) {
    return;
  }
  const destroyed = destroyEngine();
  if (destroyed && isTopFrame()) {
    void chrome.runtime.sendMessage({ type: 'TOP_FRAME_DESTROYED' }).catch((error) => {
      console.warn('TOP_FRAME_DESTROYED failed', error);
    });
  }
}

export default defineContentScript({
  registration: 'runtime',
  // WXT HMR calls matches.map; keep empty so host_permissions stay optional.
  matches: [],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',
  main(ctx) {
    const engine = startEngine(overlayActions);

    if (!engine.listening) {
      engine.listening = true;
      const onMessage = (
        message: unknown,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ): boolean => {
        if (!isExtensionRequest(message)) {
          return false;
        }
        if (message.type === 'APPLY_TAB_BEHAVIOR') {
          engine.setBehavior(message.behavior);
          sendResponse({ ok: true });
          return false;
        }
        if (message.type === 'RECONCILE_ACCESS') {
          reconcileAccess(message.allowedHostPatterns);
          return false;
        }
        return false;
      };

      chrome.runtime.onMessage.addListener(onMessage);
      ctx.onInvalidated(() => {
        chrome.runtime.onMessage.removeListener(onMessage);
        destroyEngine();
      });
    }

    chrome.runtime.sendMessage({ type: 'FRAME_READY' }, () => {
      void chrome.runtime.lastError;
    });
  },
});
