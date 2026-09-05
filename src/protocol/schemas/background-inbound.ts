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

export type BackgroundInboundRequest = {
  [K in BackgroundInboundType]: { type: K } & ReturnType<
    (typeof BACKGROUND_INBOUND)[K]['request']['parse']
  >;
}[BackgroundInboundType];

const POPUP_TYPES = new Set<string>(Object.keys(POPUP_TO_BACKGROUND));
const OPTIONS_TYPES = new Set<string>(Object.keys(OPTIONS_TO_BACKGROUND));
const CONTENT_TYPES = new Set<string>(Object.keys(CONTENT_TO_BACKGROUND));

export function inboundChannel(type: string): 'popup' | 'options' | 'content' | null {
  if (POPUP_TYPES.has(type)) {
    return 'popup';
  }
  if (OPTIONS_TYPES.has(type)) {
    return 'options';
  }
  if (CONTENT_TYPES.has(type)) {
    return 'content';
  }
  return null;
}

export function parseBackgroundInbound(value: unknown): BackgroundInboundRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string' || !(type in BACKGROUND_INBOUND)) {
    return null;
  }
  const parsed = BACKGROUND_INBOUND[type as BackgroundInboundType].request.safeParse(value);
  return parsed.success ? (parsed.data as BackgroundInboundRequest) : null;
}
