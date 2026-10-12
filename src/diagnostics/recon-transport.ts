// SPDX-License-Identifier: GPL-3.0-only

export const RECON_ENABLED = import.meta.env.DEV && import.meta.env.OSVSC_RECON === '1';
export const RECON_EVENT = 'OSVSC_RECON_EVENT';
export const RECON_CHECKPOINT = 'OSVSC_RECON_CHECKPOINT';

export type ReconData = Record<string, unknown>;

/** Content uses runtime messaging; only the background fetches localhost. */
export async function recordRecon(event: string, data: ReconData): Promise<void> {
  if (!RECON_ENABLED) return;
  const response: unknown = await chrome.runtime.sendMessage({
    type: RECON_EVENT,
    event,
    data,
    at: new Date().toISOString(),
  });
  if (!response || typeof response !== 'object' || !('ok' in response) || response.ok !== true) {
    throw new Error(
      'Local recording failed. Keep pnpm recon:dev running and reload the extension.',
    );
  }
}

let warned = false;
export function emitRecon(event: string, data: ReconData): void {
  if (!RECON_ENABLED) return;
  void (async () => {
    try {
      await recordRecon(event, data);
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn('OSVSC recon receiver unavailable', error);
      }
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
