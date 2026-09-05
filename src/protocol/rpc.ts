// SPDX-License-Identifier: GPL-3.0-only

import {
  OPTIONS_TO_BACKGROUND,
  type OptionsToBackgroundRequest,
} from './schemas/options-background';
import { POPUP_TO_BACKGROUND, type PopupToBackgroundRequest } from './schemas/popup-background';

type OptionsResponse<T extends OptionsToBackgroundRequest> =
  (typeof OPTIONS_TO_BACKGROUND)[T['type']]['response'] extends {
    parse: (data: unknown) => infer R;
  }
    ? R
    : never;

type PopupResponse<T extends PopupToBackgroundRequest> =
  (typeof POPUP_TO_BACKGROUND)[T['type']]['response'] extends {
    parse: (data: unknown) => infer R;
  }
    ? R
    : never;

export async function sendOptionsRequest<T extends OptionsToBackgroundRequest>(
  request: T,
): Promise<OptionsResponse<T> | undefined> {
  const raw: unknown = await chrome.runtime.sendMessage(request);
  const parsed = OPTIONS_TO_BACKGROUND[request.type].response.safeParse(raw);
  return parsed.success ? (parsed.data as OptionsResponse<T>) : undefined;
}

export async function sendPopupRequest<T extends PopupToBackgroundRequest>(
  request: T,
): Promise<PopupResponse<T> | undefined> {
  const raw: unknown = await chrome.runtime.sendMessage(request);
  const parsed = POPUP_TO_BACKGROUND[request.type].response.safeParse(raw);
  return parsed.success ? (parsed.data as PopupResponse<T>) : undefined;
}
