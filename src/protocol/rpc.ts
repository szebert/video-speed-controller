// SPDX-License-Identifier: GPL-3.0-only

import type { EndpointResponses, ResponseEndpoints } from './response-types';
import {
  OPTIONS_TO_BACKGROUND,
  type OptionsToBackgroundRequest,
} from './schemas/options-background';
import { POPUP_TO_BACKGROUND, type PopupToBackgroundRequest } from './schemas/popup-background';

type OptionsResponses = EndpointResponses<typeof OPTIONS_TO_BACKGROUND>;
type PopupResponses = EndpointResponses<typeof POPUP_TO_BACKGROUND>;

const optionsEndpoints: ResponseEndpoints<OptionsResponses> = OPTIONS_TO_BACKGROUND;
const popupEndpoints: ResponseEndpoints<PopupResponses> = POPUP_TO_BACKGROUND;

export async function sendOptionsRequest<T extends OptionsToBackgroundRequest>(
  request: T,
): Promise<OptionsResponses[T['type']] | undefined> {
  const raw: unknown = await chrome.runtime.sendMessage(request);
  const type: T['type'] = request.type;
  const schema = optionsEndpoints[type].response;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export async function sendPopupRequest<T extends PopupToBackgroundRequest>(
  request: T,
): Promise<PopupResponses[T['type']] | undefined> {
  const raw: unknown = await chrome.runtime.sendMessage(request);
  const type: T['type'] = request.type;
  const schema = popupEndpoints[type].response;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
