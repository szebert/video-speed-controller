// SPDX-License-Identifier: GPL-3.0-only

import {
  getOriginIdentity,
  hostPatternsCover,
  isOpaqueOrigin,
  type HostPattern,
} from '../access/site-access';
import { destroyEngine, startEngine } from '../core/video-speed-engine';
import { parseBackgroundToContent } from '../protocol/content/background-content';
import { contentFailureMessage, sendContentRequest } from '../protocol/content/client';
import type { ContentToBackgroundRequest } from '../protocol/content/content-background';
import type { OverlayActions } from '../overlay/types';

async function sendOverlayIntent(
  request: Extract<
    ContentToBackgroundRequest,
    { type: 'ADJUST_SPEED' | 'SET_OVERLAY_POSITION' | 'OPEN_OPTIONS_PAGE' }
  >,
): Promise<void> {
  try {
    const response = await sendContentRequest(request);
    if (!response) {
      console.warn(`${request.type} failed`, 'Invalid response');
      return;
    }
    const failure = contentFailureMessage(response);
    if (failure) {
      console.warn(`${request.type} failed`, failure);
    }
  } catch (error) {
    console.warn(`${request.type} failed`, error);
  }
}

const overlayActions: OverlayActions = {
  adjustSpeed(direction) {
    void sendOverlayIntent({
      type: 'ADJUST_SPEED',
      direction,
    });
  },
  setOverlayPosition(position) {
    void sendOverlayIntent({
      type: 'SET_OVERLAY_POSITION',
      position,
    });
  },
  openSettings() {
    void sendOverlayIntent({ type: 'OPEN_OPTIONS_PAGE' });
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
    void sendContentRequest({ type: 'TOP_FRAME_DESTROYED' }).catch((error) => {
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
        const inbound = parseBackgroundToContent(message);
        if (!inbound) {
          return false;
        }
        if (inbound.type === 'APPLY_TAB_BEHAVIOR') {
          engine.setBehavior(inbound.behavior);
          sendResponse({ ok: true });
          return false;
        }
        if (inbound.type === 'RECONCILE_ACCESS') {
          reconcileAccess(inbound.allowedHostPatterns);
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

    void sendContentRequest({ type: 'FRAME_READY' }).catch((error) => {
      console.warn('FRAME_READY failed', error);
    });
  },
});
