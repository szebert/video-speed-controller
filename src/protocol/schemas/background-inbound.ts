// SPDX-License-Identifier: GPL-3.0-only

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

export type BackgroundInboundRequest = {
  [K in BackgroundInboundType]: { type: K } & ReturnType<
    (typeof BACKGROUND_INBOUND)[K]['request']['parse']
  >;
}[BackgroundInboundType];

export type ParsedBackgroundInbound = {
  channel: InboundChannel;
  request: BackgroundInboundRequest;
};

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
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string') {
    return null;
  }
  const channel = inboundChannelOf(type);
  if (!channel || !(type in BACKGROUND_INBOUND)) {
    return null;
  }
  const parsed = BACKGROUND_INBOUND[type as BackgroundInboundType].request.safeParse(value);
  return parsed.success ? { channel, request: parsed.data as BackgroundInboundRequest } : null;
}
