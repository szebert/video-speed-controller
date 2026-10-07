// SPDX-License-Identifier: GPL-3.0-only

import { isRecord } from '../../types/narrow';
import { CONTENT_TO_BACKGROUND } from '../content/content-background';
import { OPTIONS_TO_BACKGROUND } from './options-background';
import { POPUP_TO_BACKGROUND } from './popup-background';

export const BACKGROUND_INBOUND = {
  ...POPUP_TO_BACKGROUND,
  ...OPTIONS_TO_BACKGROUND,
  ...CONTENT_TO_BACKGROUND,
} as const;

export type BackgroundInboundType = keyof typeof BACKGROUND_INBOUND;
export type InboundChannel = 'popup' | 'options' | 'content';

export type BackgroundInboundRequest = ReturnType<
  (typeof BACKGROUND_INBOUND)[BackgroundInboundType]['request']['parse']
>;

export type ParsedBackgroundInbound = {
  channel: InboundChannel;
  request: BackgroundInboundRequest;
};

function isBackgroundInboundType(value: string): value is BackgroundInboundType {
  return Object.hasOwn(BACKGROUND_INBOUND, value);
}

function inboundChannelOf(type: string): InboundChannel | null {
  if (Object.prototype.hasOwnProperty.call(POPUP_TO_BACKGROUND, type)) {
    return 'popup';
  }
  if (Object.prototype.hasOwnProperty.call(OPTIONS_TO_BACKGROUND, type)) {
    return 'options';
  }
  if (Object.prototype.hasOwnProperty.call(CONTENT_TO_BACKGROUND, type)) {
    return 'content';
  }
  return null;
}

export function parseBackgroundInbound(value: unknown): ParsedBackgroundInbound | null {
  if (!isRecord(value)) {
    return null;
  }
  const type = value.type;
  if (typeof type !== 'string' || !isBackgroundInboundType(type)) {
    return null;
  }
  const channel = inboundChannelOf(type);
  if (!channel) {
    return null;
  }
  const schema = BACKGROUND_INBOUND[type].request;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return { channel, request: parsed.data };
}
