// SPDX-License-Identifier: GPL-3.0-only

import {
  getOriginIdentity,
  hostPatternsCover,
  isOpaqueOrigin,
  type HostPattern,
} from '../access/site-access';
import { destroyEngine, startEngine } from '../core/video-speed-engine';
import { isExtensionRequest } from '../core/messages';

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
    void chrome.runtime.sendMessage({ type: 'TOP_FRAME_DESTROYED' });
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
    const engine = startEngine();

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
