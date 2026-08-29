// SPDX-License-Identifier: GPL-3.0-only

import type { HostPattern } from '../access/site-access';

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

export type ApplyTabTargetRequest = {
  type: 'APPLY_TAB_TARGET';
  targetSpeed: number;
};

export type ExtensionRequest =
  | GetPopupStateRequest
  | EnableSiteRequest
  | SetSpeedRequest
  | FrameReadyRequest
  | ReconcileAccessRequest
  | TopFrameDestroyedRequest
  | ApplyTabTargetRequest;

export type PopupStateResponse = {
  supported: boolean;
  hostname: string | null;
  siteSpeed: number | null;
  tabTarget: number | null;
  siteAccess: boolean;
};

export type FrameReadyResponse = { action: 'apply'; targetSpeed: number } | { action: 'dormant' };

export type SetSpeedResponse =
  { ok: true; targetSpeed: number; persistError?: string } | { ok: false; error: string };

export type EnableSiteResponse = { ok: true; targetSpeed: number } | { ok: false; error: string };

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  return (
    !!value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
  );
}
