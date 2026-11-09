// SPDX-License-Identifier: GPL-3.0-only

import { RECON_CHECKPOINT, RECON_EVENT, reconError } from './recon-transport';

async function writeEvent(
  event: string,
  data: unknown,
  sender?: chrome.runtime.MessageSender,
  sourceAt?: unknown,
): Promise<void> {
  const response = await fetch(import.meta.env.OSVSC_RECON_ENDPOINT, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      data,
      receivedAt: new Date().toISOString(),
      sourceAt: typeof sourceAt === 'string' ? sourceAt : null,
      tabId: sender?.tab?.id ?? null,
      frameId: sender?.frameId ?? null,
    }),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    if (response.status === 404)
      throw new Error(
        'Local recorder session changed. Reload the extension after restarting recon:dev.',
      );
    throw new Error(`Local receiver returned ${response.status}`);
  }
}

export function startReconBackground(): void {
  // Shared by all tabs and frames. This is disposable connection state; a new
  // service worker simply tries again. Events missed during an outage are dropped.
  let unavailable: string | null = null;
  let retryAt = 0;
  let retryDelay = 1000;
  let retryPending = false;
  const persist = async (
    event: string,
    data: unknown,
    sender?: chrome.runtime.MessageSender,
    sourceAt?: unknown,
    bestEffort = false,
  ): Promise<void> => {
    if (bestEffort && (Date.now() < retryAt || retryPending)) {
      throw new Error(unavailable ?? 'Local recording is reconnecting.');
    }
    const probing = bestEffort && unavailable !== null;
    if (probing) retryPending = true;
    try {
      await writeEvent(event, data, sender, sourceAt);
      if (unavailable !== null) console.debug('OSVSC recon receiver available; recording resumed.');
      unavailable = null;
      retryAt = 0;
      retryDelay = 1000;
    } catch (error) {
      if (unavailable === null) {
        console.debug(
          'OSVSC recon receiver unavailable; automatic recording paused. Keep recon:dev running and reload the extension after restarting it.',
          reconError(error),
        );
      }
      unavailable = reconError(error);
      retryAt = Date.now() + retryDelay;
      retryDelay = Math.min(retryDelay * 2, 30000);
      throw error;
    } finally {
      if (probing) retryPending = false;
    }
  };
  const automatic = (event: string, data: unknown): void => {
    void (async () => {
      try {
        await persist(event, data, undefined, undefined, true);
      } catch {
        // Connection state is reported once per outage above, never as a warning.
      }
    })();
  };

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return false;
    if (message.type !== RECON_EVENT && message.type !== RECON_CHECKPOINT) return false;
    if (sender.id !== chrome.runtime.id) return false;
    void (async () => {
      try {
        if (message.type === RECON_EVENT) {
          if (!('event' in message) || typeof message.event !== 'string' || !('data' in message)) {
            throw new Error('Invalid diagnostic event');
          }
          await persist(
            message.event,
            message.data,
            sender,
            'at' in message ? message.at : null,
            'bestEffort' in message && message.bestEffort === true,
          );
        } else {
          if (sender.url !== chrome.runtime.getURL('popup.html') || sender.tab) {
            throw new Error('Checkpoint must come from the toolbar popup');
          }
          if (!('tabId' in message) || typeof message.tabId !== 'number')
            throw new Error('Missing tab');
          await persist('checkpoint.request', { tabId: message.tabId });
          const result: unknown = await chrome.tabs.sendMessage(
            message.tabId,
            {
              type: RECON_CHECKPOINT,
            },
            { frameId: 0 },
          );
          if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
            throw new Error(
              'The page did not record a snapshot. Enable OSVSC and reload the site.',
            );
          }
        }
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: reconError(error) });
      }
    })();
    return true;
  });
  const permissionEvent = (event: string, permissions: chrome.permissions.Permissions): void => {
    automatic(event, permissions);
  };
  chrome.permissions.onAdded.addListener((permissions) =>
    permissionEvent('permission.added', permissions),
  );
  chrome.permissions.onRemoved.addListener((permissions) =>
    permissionEvent('permission.removed', permissions),
  );
  automatic('background.ready', { version: chrome.runtime.getManifest().version });
}
