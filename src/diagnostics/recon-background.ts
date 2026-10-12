// SPDX-License-Identifier: GPL-3.0-only

import { RECON_CHECKPOINT, RECON_EVENT, reconError } from './recon-transport';

async function persist(
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
  if (!response.ok) throw new Error(`Local receiver returned ${response.status}`);
}

export function startReconBackground(): void {
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
          await persist(message.event, message.data, sender, 'at' in message ? message.at : null);
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
    void persist(event, permissions).catch((error) => console.warn('OSVSC recon', error));
  };
  chrome.permissions.onAdded.addListener((permissions) =>
    permissionEvent('permission.added', permissions),
  );
  chrome.permissions.onRemoved.addListener((permissions) =>
    permissionEvent('permission.removed', permissions),
  );
  void persist('background.ready', { version: chrome.runtime.getManifest().version }).catch(
    (error) => console.warn('OSVSC recon', error),
  );
}
