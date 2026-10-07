// SPDX-License-Identifier: GPL-3.0-only

// Content-script RPC client. Parses only the unknown response with Mini
// schemas from this folder. Do not import protocol/schemas here.
import type { EndpointResponses, ResponseEndpoints } from '../response-types';
import { CONTENT_TO_BACKGROUND, type ContentToBackgroundRequest } from './content-background';

type ContentResponses = EndpointResponses<typeof CONTENT_TO_BACKGROUND>;
const contentEndpoints: ResponseEndpoints<ContentResponses> = CONTENT_TO_BACKGROUND;

export async function sendContentRequest<T extends ContentToBackgroundRequest>(
  request: T,
): Promise<ContentResponses[T['type']] | undefined> {
  const raw: unknown = await chrome.runtime.sendMessage(request);
  const type: T['type'] = request.type;
  const schema = contentEndpoints[type].response;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
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
