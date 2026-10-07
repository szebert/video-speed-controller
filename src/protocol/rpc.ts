// SPDX-License-Identifier: GPL-3.0-only

import { narrowed } from '../types/narrow';
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
  const schema = OPTIONS_TO_BACKGROUND[request.type].response;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  return narrowed(
    parsed.data,
    (value): value is OptionsResponse<T> => schema.safeParse(value).success,
  );
}

export async function sendPopupRequest<T extends PopupToBackgroundRequest>(
  request: T,
): Promise<PopupResponse<T> | undefined> {
  const raw: unknown = await chrome.runtime.sendMessage(request);
  const schema = POPUP_TO_BACKGROUND[request.type].response;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  return narrowed(
    parsed.data,
    (value): value is PopupResponse<T> => schema.safeParse(value).success,
  );
}
