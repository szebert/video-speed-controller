// SPDX-License-Identifier: GPL-3.0-only

export const RECON_ENABLED = import.meta.env.DEV && import.meta.env.OSVSC_RECON === '1';
export const RECON_EVENT = 'OSVSC_RECON_EVENT';
export const RECON_CHECKPOINT = 'OSVSC_RECON_CHECKPOINT';

export type ReconData = Record<string, unknown>;

/** Content uses runtime messaging; only the background fetches localhost. */
async function sendRecon(event: string, data: ReconData, bestEffort: boolean): Promise<void> {
  if (!RECON_ENABLED) return;
  const response: unknown = await chrome.runtime.sendMessage({
    type: RECON_EVENT,
    event,
    data,
    at: new Date().toISOString(),
    ...(bestEffort ? { bestEffort: true } : {}),
  });
  if (!response || typeof response !== 'object' || !('ok' in response) || response.ok !== true) {
    const detail =
      response &&
      typeof response === 'object' &&
      'error' in response &&
      typeof response.error === 'string'
        ? response.error
        : 'Keep pnpm recon:dev running and reload the extension after restarting it.';
    throw new Error(`Local recording failed. ${detail}`);
  }
}

/** Explicit records must receive a persisted acknowledgement, even during backoff. */
export function recordRecon(event: string, data: ReconData): Promise<void> {
  return sendRecon(event, data, false);
}

export function emitRecon(event: string, data: ReconData): void {
  if (!RECON_ENABLED) return;
  void (async () => {
    try {
      await sendRecon(event, data, true);
    } catch {
      // Restarts can disconnect every tab/frame at once. The background reports
      // receiver state at debug level; passive events never create Chrome errors.
    }
  })();
}

export function reconError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function reconHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
