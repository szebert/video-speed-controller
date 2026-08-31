// SPDX-License-Identifier: GPL-3.0-only

import type { HostPattern } from '../access/site-access';
import { isAppliedTabBehavior, type AppliedTabBehavior } from './applied-tab-behavior';

export type GetPopupStateRequest = {
  type: 'GET_POPUP_STATE';
  tabId: number;
  url: string;
};

export type EnableSiteRequest = {
  type: 'ENABLE_SITE';
  tabId: number;
  url: string;
};

export type SetSpeedRequest = {
  type: 'SET_SPEED';
  tabId: number;
  url: string;
  speed: number;
};

export type ResetSiteSpeedRequest = {
  type: 'RESET_SITE_SPEED';
  tabId: number;
  url: string;
};

export type FrameReadyRequest = {
  type: 'FRAME_READY';
};

export type ReconcileAccessRequest = {
  type: 'RECONCILE_ACCESS';
  allowedHostPatterns: HostPattern[];
};

export type TopFrameDestroyedRequest = {
  type: 'TOP_FRAME_DESTROYED';
};

export type ApplyTabBehaviorRequest = {
  type: 'APPLY_TAB_BEHAVIOR';
  behavior: AppliedTabBehavior;
};

export type AdjustSpeedRequest = {
  type: 'ADJUST_SPEED';
  direction: -1 | 1;
};

export type ExtensionRequest =
  | GetPopupStateRequest
  | EnableSiteRequest
  | SetSpeedRequest
  | ResetSiteSpeedRequest
  | FrameReadyRequest
  | ReconcileAccessRequest
  | TopFrameDestroyedRequest
  | ApplyTabBehaviorRequest
  | AdjustSpeedRequest;

export type PopupStateResponse = {
  supported: boolean;
  hostname: string | null;
  siteSpeed: number | null;
  tabTarget: number | null;
  siteAccess: boolean;
};

export type FrameReadyResponse = { action: 'applied' } | { action: 'dormant' };

export type SetSpeedResponse =
  { ok: true; targetSpeed: number; persistError?: string } | { ok: false; error: string };

export type EnableSiteResponse = { ok: true; targetSpeed: number } | { ok: false; error: string };

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isTabUrlRequest(value: object): value is { tabId: number; url: string } {
  return (
    isNonNegativeInteger((value as { tabId?: unknown }).tabId) &&
    typeof (value as { url?: unknown }).url === 'string'
  );
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  switch (type) {
    case 'GET_POPUP_STATE':
    case 'ENABLE_SITE':
    case 'RESET_SITE_SPEED':
      return isTabUrlRequest(value);
    case 'SET_SPEED':
      return isTabUrlRequest(value) && Number.isFinite((value as { speed?: unknown }).speed);
    case 'FRAME_READY':
    case 'TOP_FRAME_DESTROYED':
      return true;
    case 'APPLY_TAB_BEHAVIOR':
      return isAppliedTabBehavior((value as { behavior?: unknown }).behavior);
    case 'ADJUST_SPEED':
      return (
        (value as { direction?: unknown }).direction === -1 ||
        (value as { direction?: unknown }).direction === 1
      );
    case 'RECONCILE_ACCESS':
      return (
        Array.isArray((value as { allowedHostPatterns?: unknown }).allowedHostPatterns) &&
        (value as ReconcileAccessRequest).allowedHostPatterns.every(
          (pattern) => typeof pattern === 'string',
        )
      );
    default:
      return false;
  }
}
