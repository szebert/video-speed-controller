// SPDX-License-Identifier: GPL-3.0-only

import { getOriginPattern } from '../access/site-access';
import { RECON_CHECKPOINT, emitRecon, recordRecon, reconError } from './recon-transport';

export async function recordAccess(url: string, tabId: number): Promise<boolean> {
  const pattern = getOriginPattern(url);
  try {
    const [permissions, containsExact] = await Promise.all([
      chrome.permissions.getAll(),
      pattern ? chrome.permissions.contains({ origins: [pattern] }) : Promise.resolve(false),
    ]);
    await recordRecon('permission.state', { tabId, pattern, containsExact, ...permissions });
    return true;
  } catch (error) {
    emitRecon('permission.inspection-error', { tabId, pattern, error: reconError(error) });
    return false;
  }
}

/** Observe only AFTER the native request has been made synchronously. */
export function observeGrant(
  grant: Promise<boolean>,
  url: string,
  tabId: number,
  gesture: boolean,
): void {
  emitRecon('permission.request', { tabId, pattern: getOriginPattern(url), gesture });
  void (async () => {
    try {
      const granted = await grant;
      emitRecon('permission.result', { tabId, outcome: granted ? 'true' : 'false' });
    } catch (error) {
      emitRecon('permission.result', { tabId, outcome: 'rejected', error: reconError(error) });
    }
    await recordAccess(url, tabId);
  })();
}

export function observeActivation(operation: Promise<unknown>, tabId: number): void {
  void (async () => {
    try {
      const response = await operation;
      emitRecon('activation.enable-site', {
        tabId,
        outcome: 'resolved',
        response: response ?? null,
      });
    } catch (error) {
      emitRecon('activation.enable-site', { tabId, outcome: 'rejected', error: reconError(error) });
    }
  })();
}

export function checkpointButton(tabId: number, url: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rounded-md border px-3 py-2 text-sm';
  button.textContent = 'Record checkpoint';
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Recording…';
    void (async () => {
      try {
        if (!(await recordAccess(url, tabId)))
          throw new Error('Permission inspection could not be saved. Check the local recorder.');
        const response: unknown = await chrome.runtime.sendMessage({
          type: RECON_CHECKPOINT,
          tabId,
        });
        if (
          !response ||
          typeof response !== 'object' ||
          !('ok' in response) ||
          response.ok !== true
        ) {
          const error =
            response && typeof response === 'object' && 'error' in response
              ? String(response.error)
              : 'No response';
          throw new Error(error);
        }
        button.textContent = 'Checkpoint saved ✓';
      } catch (error) {
        button.textContent = `Recording failed: ${reconError(error)}`;
      } finally {
        button.disabled = false;
      }
    })();
  });
  return button;
}
