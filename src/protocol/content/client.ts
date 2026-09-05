// SPDX-License-Identifier: GPL-3.0-only

// Content-script RPC client. Parses only the unknown response with Mini
// schemas from this folder. Do not import protocol/schemas here.
import { CONTENT_TO_BACKGROUND, type ContentToBackgroundRequest } from './content-background';

type ContentResponse<T extends ContentToBackgroundRequest> =
  (typeof CONTENT_TO_BACKGROUND)[T['type']]['response'] extends {
    parse: (data: unknown) => infer R;
  }
    ? R
    : never;

export async function sendContentRequest<T extends ContentToBackgroundRequest>(
  request: T,
): Promise<ContentResponse<T> | undefined> {
  const raw: unknown = await chrome.runtime.sendMessage(request);
  const parsed = CONTENT_TO_BACKGROUND[request.type].response.safeParse(raw);
  return parsed.success ? (parsed.data as ContentResponse<T>) : undefined;
}

export function contentFailureMessage(
  response:
    { ok: true; persistError?: string; reapplyError?: string } | { ok: false; error: string },
): string | null {
  if (!response.ok) {
    return response.error;
  }
  return response.reapplyError ?? response.persistError ?? null;
}
